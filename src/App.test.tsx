import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./lib/algorithms", async () => {
  const actual = await vi.importActual<typeof import("./lib/algorithms")>("./lib/algorithms");
  return {
    ...actual,
    sampleQaoaMeasurementEstimate: vi.fn(actual.sampleQaoaMeasurementEstimate),
    sampleVqeMeasurementEstimate: vi.fn(actual.sampleVqeMeasurementEstimate),
  };
});

import App from "./App";
import { sampleQaoaMeasurementEstimate, sampleVqeMeasurementEstimate } from "./lib/algorithms";

afterEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe("App", () => {
  it("keeps rendering when a node is removed from the QAOA graph", async () => {
    const user = userEvent.setup();

    render(<App />);

    expect(screen.getByText("Nodes: 4")).toBeInTheDocument();
    expect(screen.getByText("Edges: 4")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /remove node/i }));

    expect(screen.getByText("Nodes: 3")).toBeInTheDocument();
    expect(screen.getByText("Edges: 2")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /circuit visualizer/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /analysis workspace/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /energy landscape/i })).toBeInTheDocument();
  });

  it("allows negative QAOA parameter edits", () => {
    render(<App />);

    const gammaInput = screen.getByLabelText("gamma[0]");
    fireEvent.change(gammaInput, { target: { value: "-0.25" } });
    fireEvent.blur(gammaInput);

    expect(gammaInput).toHaveValue(-0.25);
  });

  it("reverts parameter edits when Escape is pressed", () => {
    render(<App />);

    const gammaInput = screen.getByLabelText("gamma[0]");
    expect(gammaInput).toHaveValue(0.7);

    fireEvent.change(gammaInput, { target: { value: "1.23" } });
    fireEvent.keyDown(gammaInput, { key: "Escape" });

    expect(gammaInput).toHaveValue(0.7);
  });

  it("disables QAOA graph edits while the optimizer is running", async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.click(screen.getByRole("button", { name: /start optimizer/i }));

    expect(screen.getByRole("button", { name: /add node/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /remove node/i })).toBeDisabled();
    expect(screen.getByText(/stop the optimizer to edit the graph/i)).toBeInTheDocument();
  });

  it("clamps the VQE schedule floor to the selected base learning rate", async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.selectOptions(screen.getAllByRole("combobox")[0], "vqe");

    const learningRateSlider = screen.getByLabelText(/learning rate \(vqe\)/i);
    fireEvent.change(learningRateSlider, { target: { value: "0.01" } });

    expect(screen.getByLabelText(/min lr/i)).toHaveAttribute("max", "0.01");
    expect(screen.getByText(/effective now: 0\.0100/i)).toBeInTheDocument();
  });

  it("renders an exact-vs-sampled dashboard for QAOA circuits", async () => {
    const user = userEvent.setup();
    vi.mocked(sampleQaoaMeasurementEstimate).mockReturnValue({
      bitstrings: ["0011", "0011", "1100", "0011"],
      estimatedValue: 3.25,
      totalShotsUsed: 4,
    });

    render(<App />);

    fireEvent.change(screen.getByLabelText(/measurement shots per batch/i), { target: { value: "4" } });
    await user.click(screen.getByRole("button", { name: /refresh sampled estimate/i }));
    await waitFor(() => expect(sampleQaoaMeasurementEstimate).toHaveBeenCalled());

    expect(sampleQaoaMeasurementEstimate).toHaveBeenCalledWith(
      4,
      ["0-1", "1-2", "2-3", "3-0"],
      [0.7, 0.35],
      [0.35, 0.175],
      4,
      "dense-cpu",
    );
    expect(screen.getAllByText("3.250000")).toHaveLength(2);
    expect(screen.getByText(/shot budget used: 4 total measurements across one basis/i)).toBeInTheDocument();
    expect(screen.getByText(/histogram basis shots: 4/i)).toBeInTheDocument();
    expect(screen.getByText(/unique outcomes: 2/i)).toBeInTheDocument();
    expect(screen.getByText("0011")).toBeInTheDocument();
    expect(screen.getByText(/3 \/ 4 shots \(75\.0%\)/i)).toBeInTheDocument();
  });

  it("renders an exact-vs-sampled dashboard for VQE circuits", async () => {
    const user = userEvent.setup();
    vi.mocked(sampleVqeMeasurementEstimate).mockReturnValue({
      bitstrings: ["10", "10", "01"],
      estimatedValue: -1.2345,
      totalShotsUsed: 6,
    });

    render(<App />);

    await user.selectOptions(screen.getAllByRole("combobox")[0], "vqe");
    fireEvent.change(screen.getByLabelText(/measurement shots per batch/i), { target: { value: "3" } });
    await user.click(screen.getByRole("button", { name: /refresh sampled estimate/i }));
    await waitFor(() => expect(sampleVqeMeasurementEstimate).toHaveBeenCalled());

    expect(sampleVqeMeasurementEstimate).toHaveBeenCalledWith(
      [0.25, 0.125, 0.08333333333333333, 0.0625],
      "H2_0.74",
      3,
      "dense-cpu",
    );
    expect(screen.getAllByText("-1.234500")).toHaveLength(2);
    expect(screen.getByText(/shot budget used: 6 total measurements across multiple bases/i)).toBeInTheDocument();
    expect(screen.getByText(/histogram basis shots: 3/i)).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText(/2 \/ 3 shots \(66\.7%\)/i)).toBeInTheDocument();
  });

  it("queues remote sampling jobs instead of resolving them locally", async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.selectOptions(screen.getByLabelText(/execution target/i), "ionq-simulator");
    await user.selectOptions(screen.getByLabelText(/ionq auth mode/i), "server-managed");
    await user.click(screen.getByRole("button", { name: /refresh sampled estimate/i }));
    await screen.findByText(/ionq simulator · shot-sampling/i);

    expect(sampleQaoaMeasurementEstimate).not.toHaveBeenCalled();
    expect(screen.getAllByText(/server-side execution layer/i)).toHaveLength(2);
    expect(screen.getByText(/ionq simulator · shot-sampling/i)).toBeInTheDocument();
    expect(screen.getByText(/^queued$/i)).toBeInTheDocument();
    expect(screen.getByText(/provider status: submitted/i)).toBeInTheDocument();
  });

  it("resumes remote jobs after reload and eventually retrieves completed results", async () => {
    const user = userEvent.setup();

    const { unmount } = render(<App />);

    await user.selectOptions(screen.getByLabelText(/execution target/i), "ionq-qpu");
    await user.selectOptions(screen.getByLabelText(/ionq auth mode/i), "server-managed");
    await user.click(screen.getByRole("button", { name: /refresh sampled estimate/i }));
    await screen.findByText(/ionq qpu · shot-sampling/i);

    expect(screen.getByText(/^queued$/i)).toBeInTheDocument();

    unmount();
    render(<App />);

    expect(screen.getByText(/ionq qpu · shot-sampling/i)).toBeInTheDocument();
    expect(screen.getByText(/^queued$/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /poll jobs/i }));
    await screen.findByText(/provider status: ready/i);

    expect(screen.getByText(/^queued$/i)).toBeInTheDocument();
    expect(screen.getByText(/provider status: ready/i)).toBeInTheDocument();
    expect(screen.getByText(/waiting for execution/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /poll jobs/i }));
    await screen.findByText(/provider status: running/i);

    expect(screen.getByText(/^running$/i)).toBeInTheDocument();
    expect(screen.getByText(/provider status: running/i)).toBeInTheDocument();
    expect(screen.getByText(/is running/i)).toBeInTheDocument();
    expect(screen.getByText(/attempts: 2/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /poll jobs/i }));
    await screen.findByText(/result retrieval: pending/i);

    expect(screen.getByText(/^running$/i)).toBeInTheDocument();
    expect(screen.getByText(/provider status: completed/i)).toBeInTheDocument();
    expect(screen.getByText(/result retrieval: pending/i)).toBeInTheDocument();
    expect(screen.getByText(/final result payload is not ready yet/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /poll jobs/i }));
    await screen.findByText(/result retrieval: retrieved/i);

    expect(screen.getByText(/^completed$/i)).toBeInTheDocument();
    expect(screen.getByText(/result retrieval: retrieved/i)).toBeInTheDocument();
    expect(screen.getAllByText(/retrieved final ionq result payload/i)).toHaveLength(2);
    expect(screen.getByText(/total shots used/i)).toBeInTheDocument();
  });

  it("persists non-secret backend preferences while keeping IonQ credentials session-scoped", async () => {
    const user = userEvent.setup();

    const { unmount } = render(<App />);

    await user.selectOptions(screen.getByLabelText(/execution target/i), "ionq-simulator");
    await user.selectOptions(screen.getByLabelText(/ionq auth mode/i), "server-managed");
    await user.selectOptions(screen.getByLabelText(/ionq auth mode/i), "browser-session");

    expect(screen.getByLabelText(/execution target/i)).toHaveValue("ionq-simulator");
    expect(screen.getByLabelText(/ionq api key/i)).toBeInTheDocument();
    expect(screen.getByText(/tab-scoped browser session key/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/ionq api key/i), "test-ionq-key");

    expect(window.localStorage.getItem("vqa-sim:backend-preferences")).toBe(
      JSON.stringify({
        executionTarget: "ionq-simulator",
        ionqCredentialMode: "browser-session",
      }),
    );
    expect(window.localStorage.getItem("vqa-sim:provider-session-credentials")).toBeNull();
    expect(window.sessionStorage.getItem("vqa-sim:provider-session-credentials")).toContain("test-ionq-key");

    unmount();
    render(<App />);

    expect(screen.getByLabelText(/execution target/i)).toHaveValue("ionq-simulator");
    expect(screen.getByLabelText(/ionq auth mode/i)).toHaveValue("browser-session");
    expect(screen.getByLabelText(/ionq api key/i)).toHaveValue("test-ionq-key");
  });
});
