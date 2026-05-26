type IconProps = Omit<React.SVGProps<SVGSVGElement>, "strokeWidth"> & {
  size?: number;
  strokeWidth?: number;
};

function Svg({
  size = 22,
  strokeWidth = 2,
  children,
  ...props
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {children}
    </svg>
  );
}

/* Note — 굵은 가로 막대 3개 (≡) */
export function NoteIcon(props: IconProps) {
  return (
    <svg
      width={props.size ?? 22}
      height={props.size ?? 22}
      viewBox="0 0 24 24"
      fill="currentColor"
      {...props}
    >
      <rect x="6" y="7.5" width="12" height="2" rx="1" />
      <rect x="6" y="11" width="12" height="2" rx="1" />
      <rect x="6" y="14.5" width="9" height="2" rx="1" />
    </svg>
  );
}

/* Link — 두 ring 비스듬히 inter-locked */
export function LinkIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10.6 13.4a3.2 3.2 0 0 1 0-4.5l2.3-2.3a3.2 3.2 0 1 1 4.5 4.5l-1.4 1.4" />
      <path d="M13.4 10.6a3.2 3.2 0 0 1 0 4.5l-2.3 2.3a3.2 3.2 0 1 1-4.5-4.5l1.4-1.4" />
    </Svg>
  );
}

/* To-do — 체크박스 2개 + 가로줄 */
export function TodoIcon(props: IconProps) {
  return (
    <Svg {...props} strokeWidth={1.8}>
      <rect x="4" y="5.5" width="4.5" height="4.5" rx="0.8" />
      <polyline points="5,7.7 6,8.7 7.5,6.4" strokeWidth={1.8} />
      <line x1="11" y1="8" x2="20" y2="8" />
      <rect x="4" y="14" width="4.5" height="4.5" rx="0.8" />
      <line x1="11" y1="16.4" x2="20" y2="16.4" />
    </Svg>
  );
}

/* Line — 좌하 → 우상 대각 화살표 */
export function LineIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <line x1="6" y1="18" x2="18" y2="6" />
      <polyline points="11.5,6 18,6 18,12.5" />
    </Svg>
  );
}

/* Board — 둥근 사각형 4개 */
export function BoardIcon(props: IconProps) {
  return (
    <svg
      width={props.size ?? 22}
      height={props.size ?? 22}
      viewBox="0 0 24 24"
      fill="currentColor"
      {...props}
    >
      <rect x="4" y="4" width="7" height="7" rx="1.6" />
      <rect x="13" y="4" width="7" height="7" rx="1.6" />
      <rect x="4" y="13" width="7" height="7" rx="1.6" />
      <rect x="13" y="13" width="7" height="7" rx="1.6" />
    </svg>
  );
}

/* Column — 상단 굵은 막대 + 하단 넓은 박스 (column header 느낌) */
export function ColumnIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="4" y="5" width="16" height="14" rx="1.5" />
      <rect
        x="6.5"
        y="7"
        width="11"
        height="2.2"
        rx="1"
        fill="currentColor"
      />
    </Svg>
  );
}

/* Comment — 말풍선 + 안쪽 가로줄 + 꼬리 */
export function CommentIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="4" y="5" width="16" height="11" rx="1.5" />
      <line x1="7" y1="9" x2="17" y2="9" strokeWidth={2.2} />
      <line x1="7" y1="12.5" x2="14" y2="12.5" strokeWidth={2.2} />
      <path d="M9 16 L8 19 L11.5 16" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/* More — 점 3개 */
export function MoreIcon(props: IconProps) {
  return (
    <svg
      width={props.size ?? 22}
      height={props.size ?? 22}
      viewBox="0 0 24 24"
      fill="currentColor"
      {...props}
    >
      <circle cx="6" cy="12" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="18" cy="12" r="1.5" />
    </svg>
  );
}

/* Add image — 둥근 박스 + 산 + 해 */
export function ImageIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3.5" y="5" width="17" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="M3.5 16.5 L9 12 L13.5 15.5 L17 12.5 L20.5 15.5" />
    </Svg>
  );
}

/* Upload — 모서리 접힌 문서 */
export function UploadIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M14 3.5H6.5A1.5 1.5 0 0 0 5 5v14a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19V8.5z" />
      <polyline points="14,3.5 14,8.5 19,8.5" />
    </Svg>
  );
}

/* Draw — 연필 */
export function DrawIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M15.5 4 L20 8.5 L9 19.5 L4 20.5 L5 15.5 Z" />
      <line x1="13.5" y1="6" x2="18" y2="10.5" />
      <line x1="6" y1="17.5" x2="7.5" y2="19" />
    </Svg>
  );
}

/* Highlight — 마커 필 끝 + 강조줄 */
export function HighlightIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9 4 L14 9 L9.5 19 L4 20.5 L5 14.5 Z" />
      <line x1="11.5" y1="6.5" x2="16.5" y2="11.5" />
      <line x1="14" y1="20" x2="20" y2="20" strokeWidth={2.6} />
    </Svg>
  );
}

/* Audio — 마이크 (원형 헤드 + 스탠드) */
export function AudioIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11.5 a6.5 6.5 0 0 0 13 0" />
      <line x1="12" y1="18" x2="12" y2="21" />
      <line x1="9" y1="21" x2="15" y2="21" />
    </Svg>
  );
}

/* Code — < > (꺾쇠 두 개) */
export function CodeIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <polyline points="8.5,7.5 4,12 8.5,16.5" />
      <polyline points="15.5,7.5 20,12 15.5,16.5" />
      <line x1="13.5" y1="5.5" x2="10.5" y2="18.5" />
    </Svg>
  );
}

/* Mindmap — 중심 노드 + 3개 자식 (트리) */
export function MindmapIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="5" cy="12" r="2" fill="currentColor" />
      <circle cx="18" cy="6" r="1.8" />
      <circle cx="18" cy="12" r="1.8" />
      <circle cx="18" cy="18" r="1.8" />
      <line x1="7" y1="12" x2="16.2" y2="6" />
      <line x1="7" y1="12" x2="16.2" y2="12" />
      <line x1="7" y1="12" x2="16.2" y2="18" />
    </Svg>
  );
}

/* Lock — 자물쇠 (FEAT-privacy: aiOptOut 메모 표시) */
export function LockIcon(props: IconProps) {
  return (
    <Svg {...props} strokeWidth={1.8}>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11 V8 a4 4 0 0 1 8 0 V11" />
    </Svg>
  );
}

/* Expand — 대각선 화살표(펼치기) */
export function ExpandIcon(props: IconProps) {
  return (
    <Svg {...props} strokeWidth={1.8}>
      <path d="M14 4 H20 V10" />
      <path d="M10 20 H4 V14" />
      <path d="M20 4 L13 11" />
      <path d="M4 20 L11 13" />
    </Svg>
  );
}

/* Trash — 큰 휴지통 (박스 없이 단독) */
export function TrashIcon(props: IconProps) {
  return (
    <Svg {...props} strokeWidth={1.8}>
      <path d="M5 7 L19 7" />
      <path d="M9 7 V5 a1 1 0 0 1 1 -1 h4 a1 1 0 0 1 1 1 V7" />
      <path d="M6.5 7 L7.5 20.5 a1 1 0 0 0 1 1 h7 a1 1 0 0 0 1 -1 L17.5 7" />
      <line x1="10" y1="11" x2="10" y2="17.5" />
      <line x1="14" y1="11" x2="14" y2="17.5" />
    </Svg>
  );
}
