import type { BrowserContext, Page } from "playwright";

// headed ブラウザでのログイン完了を待ち、ブラウザの storageState を statePath に保存する。
//
// - ページの読み込みごと・一定間隔ごと・ページが閉じられるたびに保存する
//   (最後のページを閉じた時点ではまだコンテキストが残っていれば、その時点の状態を保存できる)
// - 次のいずれかで待機を終える: すべてのページが閉じられた / コンテキストが閉じられた / ブラウザが切断された
//   (macOS ではウィンドウを閉じてもブラウザが終了しないため、ページ数でも判定する)
// - 戻り値はこの待機中に1回でも保存に成功したか。false なら保存されていない
export async function waitForLoginAndSaveState(
  context: BrowserContext,
  statePath: string,
  options: { intervalMs?: number } = {},
): Promise<boolean> {
  const intervalMs = options.intervalMs ?? 2000;
  let saved = false;
  let finished = false;
  // 同じファイルへの書き込みが重ならないよう、保存は順番に実行する
  let queue: Promise<void> = Promise.resolve();

  const save = (): Promise<void> => {
    queue = queue.then(async () => {
      if (finished) {
        return;
      }
      try {
        await context.storageState({ path: statePath });
        saved = true;
      } catch {
        // ブラウザが終了した後や書き込みできない場合は失敗する(それ以前に保存した内容は残る)
      }
    });
    return queue;
  };

  return new Promise<boolean>((resolveDone) => {
    const timer = setInterval(() => void save(), intervalMs);

    const finish = () => {
      clearInterval(timer);
      // 実行中・予約済みの保存を待ってから終了する
      void queue.then(() => {
        finished = true;
        resolveDone(saved);
      });
    };

    const watchPage = (page: Page) => {
      page.on("load", () => void save());
      page.on("close", () => {
        void save().then(() => {
          if (context.pages().length === 0) {
            finish();
          }
        });
      });
    };

    context.pages().forEach(watchPage);
    context.on("page", watchPage);
    context.on("close", finish);
    context.browser()?.on("disconnected", finish);
  });
}
