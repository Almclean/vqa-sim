import { render, screen } from "@testing-library/react";
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
});
