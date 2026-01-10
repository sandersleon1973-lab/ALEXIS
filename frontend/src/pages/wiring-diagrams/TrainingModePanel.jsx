import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function TrainingModePanel({ apiUrl, onLoadScenario, onExit }) {
  const [scenarios, setScenarios] = useState([]);
  const [selectedId, setSelectedId] = useState("no_start_v1");
  const [stepIndex, setStepIndex] = useState(0);
  const [activeScenario, setActiveScenario] = useState(null);
  const [checkpoint, setCheckpoint] = useState(null);
  const [answer, setAnswer] = useState("");

  const selectedScenario = useMemo(
    () => scenarios.find((s) => s.id === selectedId) || scenarios[0],
    [scenarios, selectedId]
  );

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${apiUrl}/api/training/scenarios`);
        const data = await res.json();
        setScenarios(data.scenarios || []);
      } catch {
        setScenarios([]);
      }
    })();
  }, [apiUrl]);

  const start = async () => {
    if (!selectedScenario?.id) return;
    try {
      const res = await fetch(`${apiUrl}/api/training/scenarios/${selectedScenario.id}`);
      const scenario = await res.json();
      setActiveScenario(scenario);
      setStepIndex(0);
      setCheckpoint(null);
      setAnswer("");
      onLoadScenario(scenario);
    } catch {
      // noop
    }
  };

  const nextStep = () => {
    if (!activeScenario) return;
    const next = stepIndex + 1;
    if (next >= (activeScenario.steps || []).length) return;
    setStepIndex(next);
    setCheckpoint(null);
    setAnswer("");
  };

  const currentStep = activeScenario?.steps?.[stepIndex];

  useEffect(() => {
    if (!currentStep) return;

    // Emit overlay commands for this step
    for (const cmd of currentStep.commands || []) {
      window.dispatchEvent(new CustomEvent("ALEXIS_DIAGRAM_COMMAND", { detail: cmd }));
    }

    // Speak step instruction
    try {
      const u = new SpeechSynthesisUtterance(currentStep.say || "");
      u.rate = 0.95;
      u.pitch = 1.1;
      window.speechSynthesis.speak(u);
    } catch {
      // ignore
    }

    if (currentStep.checkpoint) {
      setCheckpoint(currentStep.checkpoint);
    }
  }, [currentStep]);

  const submitCheckpoint = () => {
    if (!checkpoint) return;
    const a = answer.toLowerCase();
    const ok = (checkpoint.expected_keywords || []).some((k) => a.includes(String(k).toLowerCase()));

    const feedback = ok ? checkpoint.correct_hint : checkpoint.incorrect_hint;
    try {
      const u = new SpeechSynthesisUtterance(feedback);
      u.rate = 0.95;
      u.pitch = 1.1;
      window.speechSynthesis.speak(u);
    } catch {
      // ignore
    }

    setCheckpoint(null);
    setAnswer("");
    // Ensure one-glow-at-a-time behavior (clear after checkpoint feedback)
    window.dispatchEvent(new CustomEvent("ALEXIS_DIAGRAM_COMMAND", { detail: { command: "CLEAR_DIAGRAM" } }));
    // Move forward
    setTimeout(() => nextStep(), 600);
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4" data-testid="training-mode-panel">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold tracking-wider text-slate-300" data-testid="training-mode-title">
            TRAINING / REPLAY
          </div>
          <div className="text-[11px] text-slate-500" data-testid="training-mode-subtitle">
            Minimal pilot scenario (verification-first)
          </div>
        </div>
        <Button variant="outline" onClick={onExit} data-testid="training-mode-exit-button">
          Exit
        </Button>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm text-slate-200" data-testid="training-mode-scenario-label">
            Scenario
          </div>
          <select
            className="h-9 rounded-md border border-slate-800 bg-slate-950 px-3 text-sm text-slate-100"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            data-testid="training-mode-scenario-select"
          >
            {scenarios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={start} data-testid="training-mode-start-button">
            Start replay
          </Button>
          {activeScenario && (
            <div className="text-xs text-slate-400" data-testid="training-mode-step-indicator">
              Step {stepIndex + 1} / {(activeScenario.steps || []).length}
            </div>
          )}
        </div>

        {checkpoint && (
          <div className="rounded-lg border border-cyan-900/40 bg-cyan-950/30 p-3" data-testid="training-mode-checkpoint">
            <div className="text-sm text-cyan-100" data-testid="training-mode-checkpoint-question">
              {checkpoint.question}
            </div>
            <div className="mt-2 flex gap-2">
              <Input
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="Your answer…"
                data-testid="training-mode-checkpoint-input"
              />
              <Button onClick={submitCheckpoint} data-testid="training-mode-checkpoint-submit">
                Submit
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
