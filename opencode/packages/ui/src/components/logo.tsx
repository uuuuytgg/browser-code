import { type ComponentProps } from "solid-js"

export const Mark = (props: { class?: string }) => {
  return (
    <svg
      data-component="logo-mark"
      classList={{ [props.class ?? ""]: !!props.class }}
      viewBox="0 0 16 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path data-slot="logo-logo-mark-shadow" d="M12 16H4V8H12V16Z" fill="var(--icon-weak-base)" />
      <path data-slot="logo-logo-mark-o" d="M12 4H4V16H12V4ZM16 20H0V0H16V20Z" fill="var(--icon-strong-base)" />
    </svg>
  )
}

export const Splash = (props: Pick<ComponentProps<"svg">, "ref" | "class">) => {
  return (
    <svg
      ref={props.ref}
      data-component="logo-splash"
      classList={{ [props.class ?? ""]: !!props.class }}
      viewBox="0 0 80 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M60 80H20V40H60V80Z" fill="var(--icon-base)" />
      <path d="M60 20H20V80H60V20ZM80 100H0V0H80V100Z" fill="var(--icon-strong-base)" />
    </svg>
  )
}

export const Logo = (props: { class?: string }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 330 42"
      fill="none"
      classList={{ [props.class ?? ""]: !!props.class }}
    >
      <g>
        <path d="M6 6H0V12H6ZM6 12H0V18H6ZM6 18H0V24H6ZM6 24H0V30H6ZM6 30H0V36H6Z" fill="var(--icon-weak-base)" />
        <path d="M12 6H6V12H12ZM12 18H6V24H12ZM12 30H6V36H12Z" fill="var(--icon-base)" />
        <path d="M18 6H12V12H18ZM18 18H12V24H18ZM18 30H12V36H18Z" fill="var(--icon-base)" />
        <path d="M24 12H18V18H24ZM24 24H18V30H24Z" fill="var(--icon-base)" />
        <path d="M36 6H30V12H36ZM36 12H30V18H36ZM36 18H30V24H36ZM36 24H30V30H36ZM36 30H30V36H36Z" fill="var(--icon-weak-base)" />
        <path d="M42 6H36V12H42ZM42 18H36V24H42Z" fill="var(--icon-base)" />
        <path d="M48 6H42V12H48ZM48 18H42V30H48Z" fill="var(--icon-base)" />
        <path d="M54 12H48V18H54Z" fill="var(--icon-base)" />
        <path d="M66 12H60V18H66ZM66 18H60V24H66ZM66 24H60V30H66Z" fill="var(--icon-weak-base)" />
        <path d="M72 6H66V12H72ZM72 30H66V36H72Z" fill="var(--icon-base)" />
        <path d="M78 6H72V12H78ZM78 30H72V36H78Z" fill="var(--icon-base)" />
        <path d="M84 12H78V18H84ZM84 18H78V24H84ZM84 24H78V30H84Z" fill="var(--icon-base)" />
        <path d="M96 6H90V12H96ZM96 12H90V18H96ZM96 18H90V24H96ZM96 24H90V30H96Z" fill="var(--icon-weak-base)" />
        <path d="M108 18H102V24H108ZM108 30H102V36H108Z" fill="var(--icon-base)" />
        <path d="M114 6H108V12H114ZM114 12H108V18H114ZM114 18H108V24H114ZM114 24H108V30H114Z" fill="var(--icon-base)" />
        <path d="M102 24H96V30H102ZM102 30H96V36H102Z" fill="var(--icon-base)" />
        <path d="M126 6H120V12H126ZM126 12H120V18H126ZM126 18H120V24H126ZM126 30H120V36H126Z" fill="var(--icon-weak-base)" />
        <path d="M132 6H126V12H132ZM132 18H126V24H132ZM132 30H126V36H132Z" fill="var(--icon-base)" />
        <path d="M138 6H132V12H138ZM138 18H132V24H138ZM138 30H132V36H138Z" fill="var(--icon-base)" />
        <path d="M144 24H138V30H144Z" fill="var(--icon-base)" />
        <path d="M156 6H150V12H156ZM156 12H150V18H156ZM156 18H150V24H156ZM156 24H150V30H156ZM156 30H150V36H156Z" fill="var(--icon-weak-base)" />
        <path d="M162 6H156V12H162ZM162 18H156V24H162ZM162 30H156V36H162Z" fill="var(--icon-base)" />
        <path d="M168 6H162V12H168ZM168 18H162V24H168ZM168 30H162V36H168Z" fill="var(--icon-base)" />
        <path d="M186 6H180V12H186ZM186 12H180V18H186ZM186 18H180V24H186ZM186 24H180V30H186ZM186 30H180V36H186Z" fill="var(--icon-weak-base)" />
        <path d="M192 6H186V12H192ZM192 18H186V24H192Z" fill="var(--icon-strong-base)" />
        <path d="M198 6H192V12H198ZM198 18H192V30H198Z" fill="var(--icon-strong-base)" />
        <path d="M204 12H198V18H204Z" fill="var(--icon-strong-base)" />
        <path d="M216 12H210V18H216ZM216 18H210V24H216ZM216 24H210V30H216Z" fill="var(--icon-weak-base)" />
        <path d="M222 6H216V12H222ZM222 30H216V36H222Z" fill="var(--icon-strong-base)" />
        <path d="M228 6H222V12H228ZM228 30H222V36H228Z" fill="var(--icon-strong-base)" />
        <path d="M234 6H228V12H234ZM234 30H228V36H234Z" fill="var(--icon-strong-base)" />
        <path d="M246 12H240V18H246ZM246 18H240V24H246ZM246 24H240V30H246Z" fill="var(--icon-weak-base)" />
        <path d="M252 6H246V12H252ZM252 30H246V36H252Z" fill="var(--icon-strong-base)" />
        <path d="M258 6H252V12H258ZM258 30H252V36H258Z" fill="var(--icon-strong-base)" />
        <path d="M264 12H258V18H264ZM264 18H258V24H264ZM264 24H258V30H264Z" fill="var(--icon-strong-base)" />
        <path d="M276 6H270V12H276ZM276 12H270V18H276ZM276 18H270V24H276ZM276 24H270V30H276ZM276 30H270V36H276Z" fill="var(--icon-weak-base)" />
        <path d="M282 6H276V12H282ZM282 30H276V36H282Z" fill="var(--icon-strong-base)" />
        <path d="M288 6H282V12H288ZM288 30H282V36H288Z" fill="var(--icon-strong-base)" />
        <path d="M294 12H288V18H294ZM294 18H288V24H294ZM294 24H288V30H294Z" fill="var(--icon-strong-base)" />
        <path d="M306 6H300V12H306ZM306 12H300V18H306ZM306 18H300V24H306ZM306 24H300V30H306ZM306 30H300V36H306Z" fill="var(--icon-weak-base)" />
        <path d="M312 6H306V12H312ZM312 18H306V24H312ZM312 30H306V36H312Z" fill="var(--icon-strong-base)" />
        <path d="M318 6H312V12H318ZM318 18H312V24H318ZM318 30H312V36H318Z" fill="var(--icon-strong-base)" />
      </g>
    </svg>
  )
}
