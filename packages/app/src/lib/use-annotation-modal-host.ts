import { useCallback, useEffect, useRef, type RefObject } from "react";
import { useSearchParams } from "react-router-dom";
import { fetchManual } from "./api.js";

interface UseAnnotationModalHostOptions {
  project: string;
  dirtyRef: RefObject<boolean>;
  markdownRef: RefObject<string | null>;
  mainContentRef: RefObject<HTMLDivElement | null>;
  previewRef: RefObject<HTMLDivElement | null>;
  previewHtml: string;
  schedulePreview: (text: string, immediate?: boolean) => void;
  applyExternal: (body: string) => void;
}

function setAnnotationSearchParam(
  setSearchParams: ReturnType<typeof useSearchParams>[1],
  annotationId: string | null,
  replace = false,
) {
  setSearchParams(
    (prev) => {
      const next = new URLSearchParams(prev);
      if (annotationId) {
        next.set("annotation", annotationId);
      } else {
        next.delete("annotation");
      }
      return next;
    },
    replace ? { replace: true } : undefined,
  );
}

function enhancePreviewFigures(container: HTMLElement) {
  const figures = container.querySelectorAll<HTMLElement>("figure[data-mm-annotation]");
  for (const figure of figures) {
    if (!figure.hasAttribute("tabindex")) {
      figure.tabIndex = 0;
    }
    if (!figure.getAttribute("role")) {
      figure.setAttribute("role", "button");
    }
    if (!figure.getAttribute("aria-label") && figure.dataset.mmAnnotation) {
      figure.setAttribute("aria-label", `注釈 ${figure.dataset.mmAnnotation} を編集`);
    }
  }
}

/**
 * ManualEditor 上の注釈モーダル状態機械。
 * URL・inert・フォーカス復帰・プレビュー起動・AnnotationEditor へのホスト props を一括管理する。
 */
export function useAnnotationModalHost({
  project,
  dirtyRef,
  markdownRef,
  mainContentRef,
  previewRef,
  previewHtml,
  schedulePreview,
  applyExternal,
}: UseAnnotationModalHostOptions) {
  const [searchParams, setSearchParams] = useSearchParams();
  const modalAnnotationId = searchParams.get("annotation");
  const modalOpen = modalAnnotationId !== null && modalAnnotationId !== "";
  const modalTriggerRef = useRef<HTMLElement | null>(null);
  const modalAnnotationIdRef = useRef<string | null>(null);
  const schedulePreviewRef = useRef(schedulePreview);
  schedulePreviewRef.current = schedulePreview;

  const openAnnotationModal = useCallback((annotationId: string, trigger?: HTMLElement | null) => {
    modalTriggerRef.current = trigger ?? (document.activeElement as HTMLElement | null);
    modalAnnotationIdRef.current = annotationId;
    setAnnotationSearchParam(setSearchParams, annotationId);
  }, [setSearchParams]);

  const closeAnnotationModal = useCallback(() => {
    setAnnotationSearchParam(setSearchParams, null);
  }, [setSearchParams]);

  const handleAnnotationSaved = useCallback(() => {
    const currentMarkdown = markdownRef.current;
    if (currentMarkdown !== null) {
      schedulePreviewRef.current(currentMarkdown, true);
    }
  }, [markdownRef]);

  const handleNavigateToAnnotation = useCallback((nextId: string) => {
    modalAnnotationIdRef.current = nextId;
    setAnnotationSearchParam(setSearchParams, nextId, true);
  }, [setSearchParams]);

  const handleRenamed = useCallback((nextId: string) => {
    modalAnnotationIdRef.current = nextId;
    setAnnotationSearchParam(setSearchParams, nextId, true);
    void fetchManual(project).then((manual) => {
      if (!dirtyRef.current) {
        applyExternal(manual.body);
      }
    });
  }, [applyExternal, dirtyRef, project, setSearchParams]);

  // inert 解除後: 起点要素が残っていれば優先。DOM再生成で切れていたら ID で再解決
  useEffect(() => {
    if (modalOpen) {
      if (modalAnnotationId) {
        modalAnnotationIdRef.current = modalAnnotationId;
      }
      return;
    }
    const trigger = modalTriggerRef.current;
    const annotationId = modalAnnotationIdRef.current;
    requestAnimationFrame(() => {
      if (trigger?.isConnected) {
        trigger.focus();
        return;
      }
      if (!annotationId) {
        return;
      }
      const revived = document.querySelector(
        `.preview-pane figure[data-mm-annotation="${CSS.escape(annotationId)}"], .cm-live-figure[data-mm-annotation="${CSS.escape(annotationId)}"]`,
      ) as HTMLElement | null;
      revived?.focus();
    });
  }, [modalOpen, modalAnnotationId]);

  useEffect(() => {
    const el = mainContentRef.current;
    if (!el) return;
    if (modalOpen) {
      el.setAttribute("inert", "");
    } else {
      el.removeAttribute("inert");
    }
  }, [mainContentRef, modalOpen]);

  useEffect(() => {
    const container = previewRef.current;
    if (!container) {
      return;
    }
    enhancePreviewFigures(container);
    const openFromEvent = (event: Event) => {
      const figure = (event.target as HTMLElement).closest<HTMLElement>("figure[data-mm-annotation]");
      if (!figure?.dataset.mmAnnotation) {
        return;
      }
      event.preventDefault();
      openAnnotationModal(figure.dataset.mmAnnotation, figure);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      const figure = (event.target as HTMLElement).closest<HTMLElement>("figure[data-mm-annotation]");
      if (!figure?.dataset.mmAnnotation) {
        return;
      }
      openFromEvent(event);
    };
    container.addEventListener("click", openFromEvent);
    container.addEventListener("keydown", handleKeyDown);
    return () => {
      container.removeEventListener("click", openFromEvent);
      container.removeEventListener("keydown", handleKeyDown);
    };
  }, [openAnnotationModal, previewHtml, previewRef]);

  return {
    modalOpen,
    modalAnnotationId,
    openAnnotationModal,
    closeAnnotationModal,
    handleAnnotationSaved,
    handleNavigateToAnnotation,
    handleRenamed,
  };
}
