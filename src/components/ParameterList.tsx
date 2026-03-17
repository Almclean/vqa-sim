import { useEffect, useRef, useState, type Dispatch, type KeyboardEvent, type SetStateAction } from "react";
import type { Algorithm } from "../types";

type ParameterListProps = {
  algorithm: Algorithm;
  depth: number;
  running: boolean;
  gammas: number[];
  betas: number[];
  thetas: number[];
  setGammas: Dispatch<SetStateAction<number[]>>;
  setBetas: Dispatch<SetStateAction<number[]>>;
  setThetas: Dispatch<SetStateAction<number[]>>;
};

type NumericParamInputProps = {
  label: string;
  value: number;
  disabled: boolean;
  onCommit: (next: number) => void;
};

const formatDraft = (value: number): string => `${value}`;

function NumericParamInput({ label, value, disabled, onCommit }: NumericParamInputProps): JSX.Element {
  const [draft, setDraft] = useState<string>(() => formatDraft(value));
  const cancelOnBlurRef = useRef<boolean>(false);

  useEffect(() => {
    setDraft(formatDraft(value));
  }, [value]);

  const commitDraft = () => {
    if (cancelOnBlurRef.current) {
      cancelOnBlurRef.current = false;
      setDraft(formatDraft(value));
      return;
    }

    const trimmed = draft.trim();
    if (trimmed === "" || trimmed === "-" || trimmed === "+" || trimmed === "." || trimmed === "-." || trimmed === "+.") {
      setDraft(formatDraft(value));
      return;
    }

    const next = Number(trimmed);
    if (!Number.isFinite(next)) {
      setDraft(formatDraft(value));
      return;
    }

    onCommit(next);
    setDraft(formatDraft(next));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.currentTarget.blur();
    }
    if (event.key === "Escape") {
      cancelOnBlurRef.current = true;
      setDraft(formatDraft(value));
      event.currentTarget.blur();
    }
  };

  return (
    <label className="flex flex-col gap-1 text-xs text-neutral-400">
      {label}
      <input
        type="number"
        step="0.01"
        inputMode="decimal"
        value={draft}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commitDraft}
        onKeyDown={handleKeyDown}
        className="rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1 text-sm text-neutral-100 outline-none ring-cyan-400 focus:ring-2 disabled:opacity-50"
      />
    </label>
  );
}

export function ParameterList({
  algorithm,
  depth,
  running,
  gammas,
  betas,
  thetas,
  setGammas,
  setBetas,
  setThetas,
}: ParameterListProps): JSX.Element {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-widest text-neutral-300">Parameters</h2>

      <div className="max-h-56 space-y-2 overflow-y-auto rounded-lg border border-neutral-800 bg-neutral-950/60 p-3">
        {algorithm === "qaoa"
          ? Array.from({ length: depth }, (_, i) => (
              <div key={`qaoa-param-${i}`} className="grid grid-cols-2 gap-2">
                <NumericParamInput
                  label={`gamma[${i}]`}
                  value={gammas[i] ?? 0}
                  disabled={running}
                  onCommit={(next) =>
                    setGammas((prev) => {
                      const copy = [...prev];
                      copy[i] = next;
                      return copy;
                    })
                  }
                />
                <NumericParamInput
                  label={`beta[${i}]`}
                  value={betas[i] ?? 0}
                  disabled={running}
                  onCommit={(next) =>
                    setBetas((prev) => {
                      const copy = [...prev];
                      copy[i] = next;
                      return copy;
                    })
                  }
                />
              </div>
            ))
          : Array.from({ length: depth * 2 }, (_, i) => (
              <NumericParamInput
                key={`vqe-param-${i}`}
                label={`theta[${i}]`}
                value={thetas[i] ?? 0}
                disabled={running}
                onCommit={(next) =>
                  setThetas((prev) => {
                    const copy = [...prev];
                    copy[i] = next;
                    return copy;
                  })
                }
              />
            ))}
      </div>
    </section>
  );
}
