export interface ICommand {
  execute(): Promise<void>;
  unexecute(): Promise<void>;
  // Transaction ids this command reads or writes. Merge/collapse/explode use it to drop only
  // the history entries they invalidate; a command without it is treated as touching everything.
  getAffectedIds?(): number[];
}

export interface ICommandWithResult<T> {
  execute(): Promise<T>;
  unexecute(): Promise<void>;
  getAffectedIds?(): number[];
}
