// Hermes Icon - 날개 달린 헬멧 (상업/거래의 신 상징)
interface IconProps {
  size?: number;
  className?: string;
}

export const HermesIcon = ({ size = 24, className = "" }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    {/* 헬멧 본체 */}
    <path
      d="M12 3C8 3 5 6 5 10V14C5 16 6 18 8 19H16C18 18 19 16 19 14V10C19 6 16 3 12 3Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
    {/* 헬멧 가드 */}
    <path
      d="M5 12H19"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    {/* 왼쪽 날개 */}
    <path
      d="M5 10C5 10 3 9 1 10C2 8 3 6 5 7"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
    <path
      d="M4 8C4 8 2 6 1 6C2 5 3 4 5 5"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
    {/* 오른쪽 날개 */}
    <path
      d="M19 10C19 10 21 9 23 10C22 8 21 6 19 7"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
    <path
      d="M20 8C20 8 22 6 23 6C22 5 21 4 19 5"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
    {/* 중앙 장식 */}
    <circle cx="12" cy="8" r="1.5" fill="currentColor" />
  </svg>
);

export default HermesIcon;
