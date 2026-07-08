// 配列の要素を from から to へ移動した新しい配列を返す(不変操作)。
// オブジェクト一覧の D&D 並べ替え(= 描画順の変更)に使う
export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from < 0 || from >= items.length || to < 0 || to >= items.length) {
    return [...items];
  }
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item as T);
  return next;
}
