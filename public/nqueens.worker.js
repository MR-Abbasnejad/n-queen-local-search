function conflicts(board) {
  let count = 0;

  for (let r = 0; r < board.length; r++) {
    for (let other = r + 1; other < board.length; other++) {
      if (
        board[r] === board[other] ||
        Math.abs(r - other) === Math.abs(board[r] - board[other])
      ) {
        count++;
      }
    }
  }

  return count;
}

function randomBoard(n) {
  return Array.from({ length: n }, () => Math.floor(Math.random() * n));
}

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function hillClimbing(n, maxAttempts, stepDelay) {
  let attempts = 0;
  let successful = 0;
  let evaluations = 0;
  const seen = new Set();

  while (attempts < maxAttempts) {
    attempts++;

    let board = randomBoard(n);
    let score = conflicts(board);

    self.postMessage({
      type: "STEP",
      board: [...board],
      conflicts: score,
      attempts,
      successful,
      unique: seen.size,
      evaluations,
    });

    while (score > 0) {
      let bestBoard = null;
      let bestScore = score;

      for (let row = 0; row < n; row++) {
        for (let col = 0; col < n; col++) {
          if (col === board[row]) continue;

          const candidate = [...board];
          candidate[row] = col;
          evaluations++;

          const candidateScore = conflicts(candidate);

          if (candidateScore < bestScore) {
            bestScore = candidateScore;
            bestBoard = candidate;
          }
        }
      }

      if (!bestBoard) break; // Local optimum: try another random start.

      board = bestBoard;
      score = bestScore;

      self.postMessage({
        type: "STEP",
        board: [...board],
        conflicts: score,
        attempts,
        successful,
        unique: seen.size,
        evaluations,
      });

      if (stepDelay > 0) await pause(stepDelay);
    }

    if (score === 0) {
      successful++;

      const key = board.join(",");
      if (!seen.has(key)) {
        seen.add(key);

        self.postMessage({
          type: "SOLUTION",
          board: [...board],
          attempts,
          successful,
          unique: seen.size,
          evaluations,
        });
      }
    }

    self.postMessage({
      type: "PROGRESS",
      attempts,
      successful,
      unique: seen.size,
      evaluations,
    });
  }

  self.postMessage({
    type: "DONE",
    attempts,
    successful,
    unique: seen.size,
    evaluations,
  });
}

async function simulatedAnnealing(n, maxAttempts, stepDelay, startTemp, cooling) {
  const MAX_STEPS = 5000; // moves per run before giving up and restarting

  let attempts = 0;
  let successful = 0;
  let evaluations = 0;
  const seen = new Set();

  while (attempts < maxAttempts) {
    attempts++;

    let board = randomBoard(n);
    let score = conflicts(board);
    let temp = startTemp;

    self.postMessage({
      type: "STEP",
      board: [...board],
      conflicts: score,
      attempts,
      successful,
      unique: seen.size,
      evaluations,
    });

    for (let step = 0; step < MAX_STEPS && score > 0; step++) {
      // Random neighbor: move one queen to a different column in its row.
      const row = Math.floor(Math.random() * n);
      let col = Math.floor(Math.random() * (n - 1));
      if (col >= board[row]) col++;

      const candidate = [...board];
      candidate[row] = col;
      evaluations++;

      const candidateScore = conflicts(candidate);
      const delta = candidateScore - score;

      // Always accept improvements; accept worse moves with probability exp(-delta / T).
      if (delta <= 0 || Math.random() < Math.exp(-delta / temp)) {
        board = candidate;
        score = candidateScore;

        self.postMessage({
          type: "STEP",
          board: [...board],
          conflicts: score,
          attempts,
          successful,
          unique: seen.size,
          evaluations,
        });

        if (stepDelay > 0) await pause(stepDelay);
      }

      temp *= cooling;
    }

    if (score === 0) {
      successful++;

      const key = board.join(",");
      if (!seen.has(key)) {
        seen.add(key);

        self.postMessage({
          type: "SOLUTION",
          board: [...board],
          attempts,
          successful,
          unique: seen.size,
          evaluations,
        });
      }
    }

    self.postMessage({
      type: "PROGRESS",
      attempts,
      successful,
      unique: seen.size,
      evaluations,
    });
  }

  self.postMessage({
    type: "DONE",
    attempts,
    successful,
    unique: seen.size,
    evaluations,
  });
}

async function exhaustiveSearch(n) {
  // Iterative backtracking: one queen per row, no conflicting columns/diagonals.
  const board = Array(n).fill(-1);
  const nextColumn = Array(n).fill(0);
  const columns = new Uint8Array(n);
  const downDiagonals = new Uint8Array(2 * n - 1); // row - col + n - 1
  const upDiagonals = new Uint8Array(2 * n - 1);   // row + col

  let row = 0;
  let attempts = 0;
  let successful = 0;
  let batch = [];

  function release(r) {
    const col = board[r];
    columns[col] = 0;
    downDiagonals[r - col + n - 1] = 0;
    upDiagonals[r + col] = 0;
  }

  function flush() {
    if (batch.length === 0) return;

    self.postMessage({
      type: "SOLUTIONS",
      boards: batch,
      attempts,
      successful,
      unique: successful,
    });

    batch = [];
  }

  while (row >= 0) {
    if (row === n) {
      successful++;
      batch.push([...board]);

      if (batch.length >= 32) flush();

      row--;
      release(row);
      continue;
    }

    if (nextColumn[row] === n) {
      nextColumn[row] = 0;
      row--;

      if (row >= 0) release(row);
      continue;
    }

    const col = nextColumn[row]++;
    attempts++; // Every proposed row/column placement counts.

    // Yield occasionally so the worker can report progress.
    if (attempts % 4096 === 0) {
      flush();
      self.postMessage({
        type: "PROGRESS",
        attempts,
        successful,
        unique: successful,
      });
      await pause(0);
    }

    const down = row - col + n - 1;
    const up = row + col;

    if (columns[col] || downDiagonals[down] || upDiagonals[up]) {
      continue;
    }

    board[row] = col;
    columns[col] = 1;
    downDiagonals[down] = 1;
    upDiagonals[up] = 1;
    row++;
  }

  flush();

  self.postMessage({
    type: "DONE",
    attempts,
    successful,
    unique: successful,
  });
}

self.onmessage = (event) => {
  const {
    mode,
    n,
    maxAttempts = 100,
    stepDelay = 50,
    startTemp = 2,
    cooling = 0.999,
  } = event.data;

  if (!Number.isInteger(n) || n < 4 || n > 10) {
    self.postMessage({ type: "ERROR", message: "Choose N from 4 to 10." });
    return;
  }

  const validRuns = Number.isInteger(maxAttempts) && maxAttempts >= 1;

  if (mode === "all") {
    void exhaustiveSearch(n);
  } else if (mode === "hill" && validRuns) {
    void hillClimbing(n, maxAttempts, stepDelay);
  } else if (
    mode === "anneal" &&
    validRuns &&
    startTemp > 0 &&
    cooling > 0 &&
    cooling < 1
  ) {
    void simulatedAnnealing(n, maxAttempts, stepDelay, startTemp, cooling);
  } else {
    self.postMessage({ type: "ERROR", message: "Invalid solver settings." });
  }
};
