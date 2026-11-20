"use client";

import { useEffect, useRef, useState } from "react";

type Mode = "hill" | "anneal" | "all";

type WorkerMessage = {
  type: "STEP" | "SOLUTION" | "SOLUTIONS" | "PROGRESS" | "DONE" | "ERROR";
  board?: number[];
  boards?: number[][];
  conflicts?: number;
  attempts?: number;
  successful?: number;
  unique?: number;
  evaluations?: number;
  message?: string;
};

function countConflicts(board: number[]) {
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

function randomBoard(n: number) {
  return Array.from({ length: n }, () => Math.floor(Math.random() * n));
}

export default function Page() {
  const [n, setN] = useState(8);
  const [mode, setMode] = useState<Mode>("hill");
  const [board, setBoard] = useState<number[]>(Array.from({ length: 8 }, (_, i) => i));
  const [conflicts, setConflicts] = useState(28);

  const [attempts, setAttempts] = useState(0);
  const [successful, setSuccessful] = useState(0);
  const [unique, setUnique] = useState(0);
  const [evaluations, setEvaluations] = useState(0);
  const [solutions, setSolutions] = useState<number[][]>([]);
  const [selected, setSelected] = useState(0);

  const [maxAttempts, setMaxAttempts] = useState(100);
  const [stepDelay, setStepDelay] = useState(50);
  const [startTemp, setStartTemp] = useState(2);
  const [cooling, setCooling] = useState(0.999);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("Ready");

  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    return () => workerRef.current?.terminate();
  }, []);

  function stop() {
    workerRef.current?.terminate();
    workerRef.current = null;
    setRunning(false);
  }

  function reset(size = n) {
    stop();

    const fresh = randomBoard(size);
    setBoard(fresh);
    setConflicts(countConflicts(fresh));
    setAttempts(0);
    setSuccessful(0);
    setUnique(0);
    setEvaluations(0);
    setSolutions([]);
    setSelected(0);
    setStatus("Ready");
  }

  function start() {
    stop();

    setAttempts(0);
    setSuccessful(0);
    setUnique(0);
    setEvaluations(0);
    setSolutions([]);
    setSelected(0);
    setStatus("Searching...");
    setRunning(true);

    const worker = new Worker("/nqueens.worker.js");
    workerRef.current = worker;
    let receivedFirstSolution = false;

    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      if (workerRef.current !== worker) return;

      const data = event.data;

      if (data.attempts !== undefined) setAttempts(data.attempts);
      if (data.successful !== undefined) setSuccessful(data.successful);
      if (data.unique !== undefined) setUnique(data.unique);
      if (data.evaluations !== undefined) setEvaluations(data.evaluations);

      if (data.type === "STEP" && data.board) {
        setBoard(data.board);
        setConflicts(data.conflicts ?? countConflicts(data.board));
      }

      const found =
        data.type === "SOLUTION" && data.board
          ? [data.board]
          : data.type === "SOLUTIONS"
            ? (data.boards ?? [])
            : [];

      if (found.length > 0) {
        setSolutions((previous) => [...previous, ...found]);

        if (!receivedFirstSolution) {
          receivedFirstSolution = true;
          setBoard(found[0]);
          setConflicts(0);
          setSelected(0);
        }
      }

      if (data.type === "DONE") {
        setStatus(
          mode === "all"
            ? `Complete: all ${data.successful ?? 0} solutions found`
            : `Complete: ${data.unique ?? 0} distinct solutions found`
        );
        stop();
      } else if (data.type === "ERROR") {
        setStatus(data.message ?? "Solver error");
        stop();
      }
    };

    worker.onerror = () => {
      if (workerRef.current !== worker) return;
      setStatus("Worker error");
      stop();
    };

    worker.postMessage({ mode, n, maxAttempts, stepDelay, startTemp, cooling });
  }

  function showSolution(index: number) {
    setSelected(index);
    setBoard(solutions[index]);
    setConflicts(0);
  }

  return (
    <main className="min-h-screen bg-neutral-950 p-6 text-neutral-100">
      <div className="mx-auto max-w-2xl space-y-5">
        <header>
          <h1 className="text-3xl font-bold">N-Queens Solver</h1>
          <p className="text-sm text-neutral-400">
            Runs entirely in your browser.
          </p>
        </header>

        <div className="flex flex-wrap items-end gap-3 rounded-lg bg-neutral-900 p-4">
          <label className="text-sm">
            Mode
            <select
              value={mode}
              disabled={running}
              onChange={(e) => {
                setMode(e.target.value as Mode);
                reset();
              }}
              className="mt-1 block rounded bg-neutral-800 p-2"
            >
              <option value="hill">Hill climbing</option>
              <option value="anneal">Simulated annealing</option>
              <option value="all">All solutions (exhaustive)</option>
            </select>
          </label>

          <label className="text-sm">
            N
            <select
              value={n}
              disabled={running}
              onChange={(e) => {
                const size = Number(e.target.value);
                setN(size);
                reset(size);
              }}
              className="mt-1 block rounded bg-neutral-800 p-2"
            >
              {[4, 5, 6, 7, 8, 9, 10].map((size) => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
          </label>

          {mode !== "all" && (
            <>
              <label className="text-sm">
                Max attempts
                <input
                  type="number"
                  min="1"
                  max="100000"
                  value={maxAttempts}
                  disabled={running}
                  onChange={(e) =>
                    setMaxAttempts(Math.max(1, Number(e.target.value) || 1))
                  }
                  className="mt-1 block w-28 rounded bg-neutral-800 p-2"
                />
              </label>

              <label className="text-sm">
                Step delay (ms)
                <input
                  type="number"
                  min="0"
                  max="1000"
                  value={stepDelay}
                  disabled={running}
                  onChange={(e) =>
                    setStepDelay(Math.max(0, Number(e.target.value) || 0))
                  }
                  className="mt-1 block w-28 rounded bg-neutral-800 p-2"
                />
              </label>
            </>
          )}

          {mode === "anneal" && (
            <>
              <label className="text-sm">
                Start temp
                <input
                  type="number"
                  min="0.01"
                  step="0.1"
                  value={startTemp}
                  disabled={running}
                  onChange={(e) =>
                    setStartTemp(Math.max(0.01, Number(e.target.value) || 0.01))
                  }
                  className="mt-1 block w-28 rounded bg-neutral-800 p-2"
                />
              </label>

              <label className="text-sm">
                Cooling
                <input
                  type="number"
                  min="0.9"
                  max="0.99999"
                  step="0.001"
                  value={cooling}
                  disabled={running}
                  onChange={(e) =>
                    setCooling(
                      Math.min(0.99999, Math.max(0.9, Number(e.target.value) || 0.999))
                    )
                  }
                  className="mt-1 block w-28 rounded bg-neutral-800 p-2"
                />
              </label>
            </>
          )}

          <button
            onClick={start}
            disabled={running}
            className="rounded bg-amber-500 px-4 py-2 font-semibold text-black disabled:opacity-50"
          >
            Start
          </button>

          <button
            onClick={() => {
              stop();
              setStatus("Stopped");
            }}
            disabled={!running}
            className="rounded bg-rose-600 px-4 py-2 disabled:opacity-50"
          >
            Stop
          </button>

          <button
            onClick={() => reset()}
            className="rounded bg-neutral-700 px-4 py-2"
          >
            Reset
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            [mode === "all" ? "Placements tried" : "Runs attempted", attempts],
            [mode === "all" ? "Solutions found" : "Successful runs", successful],
            ["Unique solutions", unique],
            [
              mode === "all" ? "Saved boards" : "Neighbors evaluated",
              mode === "all" ? solutions.length : evaluations,
            ],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded bg-neutral-900 p-3">
              <div className="text-xs text-neutral-400">{label}</div>
              <div className="text-2xl font-bold">{value}</div>
            </div>
          ))}
        </div>

        <p className="text-sm">
          {status} · Current board conflicts: {conflicts}
        </p>

        <div
          className="grid aspect-square w-full overflow-hidden rounded-lg border border-neutral-700"
          style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: n * n }, (_, index) => {
            const row = Math.floor(index / n);
            const col = index % n;

            return (
              <div
                key={index}
                className={`flex items-center justify-center ${
                  (row + col) % 2 ? "bg-neutral-800" : "bg-neutral-700"
                }`}
              >
                {board[row] === col && (
                  <span className="text-2xl text-amber-400">♛</span>
                )}
              </div>
            );
          })}
        </div>

        <label className="block text-sm">
          Browse found solutions ({solutions.length})
          <select
            value={selected}
            disabled={solutions.length === 0}
            onChange={(e) => showSolution(Number(e.target.value))}
            className="mt-1 block w-full rounded bg-neutral-800 p-2"
          >
            {solutions.length === 0 && <option>No solutions yet</option>}
            {solutions.map((solution, index) => (
              <option key={solution.join(",")} value={index}>
                Solution {index + 1}: [{solution.join(", ")}]
              </option>
            ))}
          </select>
        </label>

        {mode !== "all" && (
          <p className="text-sm text-neutral-400">
            Local search (hill climbing and simulated annealing) records
            solutions it discovers; it does not prove that undiscovered
            solutions do not exist. Switch to exhaustive mode to find them all.
          </p>
        )}
      </div>
    </main>
  );
}
