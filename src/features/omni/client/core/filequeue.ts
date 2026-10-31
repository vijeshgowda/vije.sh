export type FileResult<T> =
  { file: T; status: "sent" } | { file: T; status: "failed"; error: unknown };

// The current original app starts transfers concurrently; file IDs demultiplex their frames.
export async function processFileQueue<T>(
  queue: T[],
  send: (file: T) => Promise<void>,
  onResult: (result: FileResult<T>) => void,
): Promise<FileResult<T>[]> {
  const pending: Promise<FileResult<T>>[] = [];
  while (queue.length > 0) {
    const file = queue.shift()!;
    pending.push(
      (async () => {
        let result: FileResult<T>;
        try {
          await send(file);
          result = { file, status: "sent" };
        } catch (error) {
          result = { file, status: "failed", error };
        }
        onResult(result);
        return result;
      })(),
    );
  }
  return Promise.all(pending);
}
