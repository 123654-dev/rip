export type Operation = {
  label?: string;
  apply: () => void;
  revert: () => void;
};

class History {
  past = $state<Operation[]>([]);
  future = $state<Operation[]>([]);

  /**
   * Push an operation that has *already been applied*. Clears the redo stack.
   * `apply` is used for redo; `revert` is used for undo.
   */
  push(op: Operation): void {
    this.past.push(op);
    this.future = [];
  }

  undo(): void {
    const op = this.past.pop();
    if (!op) return;
    op.revert();
    this.future.push(op);
  }

  redo(): void {
    const op = this.future.pop();
    if (!op) return;
    op.apply();
    this.past.push(op);
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }
  get canRedo(): boolean {
    return this.future.length > 0;
  }

  clear(): void {
    this.past = [];
    this.future = [];
  }
}

export const history = new History();
