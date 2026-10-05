import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

export interface RenderHookResult<Result, Props> {
  result: { readonly current: Result };
  rerender: (props: Props) => void;
  unmount: () => void;
}

/**
 * @testing-library/react の renderHook 相当の最小実装(jsdom 環境用)。
 * 依存を増やさないため react-dom/client と act だけで組み立てる。
 */
export function renderHook<Result, Props = undefined>(
  hook: (props: Props) => Result,
  options: { initialProps?: Props } = {},
): RenderHookResult<Result, Props> {
  const container = document.createElement("div");
  document.body.append(container);
  const root: Root = createRoot(container);
  const result = { current: undefined as Result };
  function Probe({ props }: { props: Props }) {
    result.current = hook(props);
    return null;
  }
  act(() => {
    root.render(<Probe props={options.initialProps as Props} />);
  });
  return {
    result,
    rerender: (props: Props) => {
      act(() => {
        root.render(<Probe props={props} />);
      });
    },
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

/** Promise の解決や state 更新を act 内で流し切る */
export async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}
