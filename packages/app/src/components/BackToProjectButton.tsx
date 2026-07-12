import { useNavigate } from "react-router-dom";
import { IconArrowLeft } from "./icons.js";
import { Button } from "./ui.js";

interface BackToProjectButtonProps {
  project: string;
  /** 未保存確認など、親が遷移を仲介する場合に指定 */
  onClick?: () => void;
}

/** マニュアル編集・注釈エディタ共通の「←戻る」ボタン */
export function BackToProjectButton({ project, onClick }: BackToProjectButtonProps) {
  const navigate = useNavigate();
  return (
    <Button
      size="sm"
      variant="ghost"
      data-testid="back-to-project"
      onClick={onClick ?? (() => navigate(`/projects/${encodeURIComponent(project)}`))}
    >
      <IconArrowLeft size={14} />
      戻る
    </Button>
  );
}
