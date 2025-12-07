// Athena Icon - 올빼미 (지혜의 여신 상징)
interface IconProps {
  size?: number;
  className?: string;
}

export const AthenaIcon = ({ size = 24, className = "" }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    {/* 올빼미 얼굴 윤곽 */}
    <path
      d="M12 2C7 2 4 6 4 10C4 14 6 18 12 22C18 18 20 14 20 10C20 6 17 2 12 2Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
    {/* 왼쪽 눈 */}
    <circle
      cx="9"
      cy="10"
      r="2.5"
      stroke="currentColor"
      strokeWidth="1.5"
      fill="none"
    />
    <circle cx="9" cy="10" r="1" fill="currentColor" />
    {/* 오른쪽 눈 */}
    <circle
      cx="15"
      cy="10"
      r="2.5"
      stroke="currentColor"
      strokeWidth="1.5"
      fill="none"
    />
    <circle cx="15" cy="10" r="1" fill="currentColor" />
    {/* 부리 */}
    <path
      d="M12 12L10.5 15H13.5L12 12Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
      fill="none"
    />
    {/* 귀 깃털 */}
    <path
      d="M6 5L4 2"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <path
      d="M18 5L20 2"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);

export default AthenaIcon;
