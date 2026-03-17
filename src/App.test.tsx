import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App from "./App";

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
});
