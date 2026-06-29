/**
 * Pixel-style BROWSERCODE logo as inline SVG.
 * 11 letters, 4×5 pixel grid per letter, 330×42 viewBox.
 */
export function BrowserCodeLogo({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 330 42"
      fill="none"
      className={className}
      style={{ display: "block", width: "100%", height: "100%" }}
    >
      <g>
        {/* B */}
        <path d="M6 6H0V36H6Z" fill="currentColor" opacity="0.5" />
        <path d="M12 6H6V12H12ZM12 18H6V24H12ZM12 30H6V36H12Z" fill="currentColor" opacity="0.7" />
        <path d="M18 6H12V12H18ZM18 18H12V24H18ZM18 30H12V36H18Z" fill="currentColor" opacity="0.7" />
        <path d="M24 12H18V18H24ZM24 24H18V30H24Z" fill="currentColor" opacity="0.7" />
        {/* R */}
        <path d="M36 6H30V36H36Z" fill="currentColor" opacity="0.5" />
        <path d="M42 6H36V12H42ZM42 18H36V24H42Z" fill="currentColor" opacity="0.7" />
        <path d="M48 6H42V12H48ZM48 18H42V30H48Z" fill="currentColor" opacity="0.7" />
        <path d="M54 12H48V18H54Z" fill="currentColor" opacity="0.7" />
        {/* O */}
        <path d="M66 12H60V30H66Z" fill="currentColor" opacity="0.5" />
        <path d="M72 6H66V12H72ZM72 30H66V36H72Z" fill="currentColor" opacity="0.7" />
        <path d="M78 6H72V12H78ZM78 30H72V36H78Z" fill="currentColor" opacity="0.7" />
        <path d="M84 12H78V30H84Z" fill="currentColor" opacity="0.7" />
        {/* W */}
        <path d="M96 6H90V30H96Z" fill="currentColor" opacity="0.5" />
        <path d="M102 24H96V36H102Z" fill="currentColor" opacity="0.7" />
        <path d="M108 18H102V24H108ZM108 30H102V36H108Z" fill="currentColor" opacity="0.7" />
        <path d="M114 6H108V30H114Z" fill="currentColor" opacity="0.7" />
        {/* S */}
        <path d="M126 6H120V24H126ZM126 30H120V36H126Z" fill="currentColor" opacity="0.5" />
        <path d="M132 6H126V12H132ZM132 18H126V24H132ZM132 30H126V36H132Z" fill="currentColor" opacity="0.7" />
        <path d="M138 6H132V12H138ZM138 18H132V24H138ZM138 30H132V36H138Z" fill="currentColor" opacity="0.7" />
        <path d="M144 24H138V30H144Z" fill="currentColor" opacity="0.7" />
        {/* E */}
        <path d="M156 6H150V36H156Z" fill="currentColor" opacity="0.5" />
        <path d="M162 6H156V12H162ZM162 18H156V24H162ZM162 30H156V36H162Z" fill="currentColor" opacity="0.7" />
        <path d="M168 6H162V12H168ZM168 18H162V24H168ZM168 30H162V36H168Z" fill="currentColor" opacity="0.7" />
        {/* R */}
        <path d="M186 6H180V36H186Z" fill="currentColor" opacity="0.5" />
        <path d="M192 6H186V12H192ZM192 18H186V24H192Z" fill="currentColor" />
        <path d="M198 6H192V12H198ZM198 18H192V30H198Z" fill="currentColor" />
        <path d="M204 12H198V18H204Z" fill="currentColor" />
        {/* C */}
        <path d="M216 12H210V30H216Z" fill="currentColor" opacity="0.5" />
        <path d="M222 6H216V12H222ZM222 30H216V36H222Z" fill="currentColor" />
        <path d="M228 6H222V12H228ZM228 30H222V36H228Z" fill="currentColor" />
        <path d="M234 6H228V12H234ZM234 30H228V36H234Z" fill="currentColor" />
        {/* O */}
        <path d="M246 12H240V30H246Z" fill="currentColor" opacity="0.5" />
        <path d="M252 6H246V12H252ZM252 30H246V36H252Z" fill="currentColor" />
        <path d="M258 6H252V12H258ZM258 30H252V36H258Z" fill="currentColor" />
        <path d="M264 12H258V30H264Z" fill="currentColor" />
        {/* D */}
        <path d="M276 6H270V36H276Z" fill="currentColor" opacity="0.5" />
        <path d="M282 6H276V12H282ZM282 30H276V36H282Z" fill="currentColor" />
        <path d="M288 6H282V12H288ZM288 30H282V36H288Z" fill="currentColor" />
        <path d="M294 12H288V30H294Z" fill="currentColor" />
        {/* E */}
        <path d="M306 6H300V36H306Z" fill="currentColor" opacity="0.5" />
        <path d="M312 6H306V12H312ZM312 18H306V24H312ZM312 30H306V36H312Z" fill="currentColor" />
        <path d="M318 6H312V12H318ZM318 18H312V24H318ZM318 30H312V36H318Z" fill="currentColor" />
      </g>
    </svg>
  );
}
