import path from "path"
import { Effect, Schema } from "effect"
import { Ripgrep } from "@opencode-ai/core/ripgrep"
import { Skill } from "../skill"
import * as Tool from "./tool"
import DESCRIPTION from "./skill.txt"
import {
  allowSkillExecutionForBrowserCodeCoreContext,
  buildBrowserCodeCoreContext,
} from "@/browser-code/core-context"

export const Parameters = Schema.Struct({
  name: Schema.String.annotate({ description: "The name of the skill from available_skills" }),
})

export const SkillTool = Tool.define(
  "skill",
  Effect.gen(function* () {
    const skill = yield* Skill.Service
    const ripgrep = yield* Ripgrep.Service

    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const lastUser = ctx.messages.findLast((message) => message.info.role === "user")
          const browserCodeCoreContext = buildBrowserCodeCoreContext({
            lastUser,
            messages: ctx.messages,
          })
          if (!allowSkillExecutionForBrowserCodeCoreContext(params.name, browserCodeCoreContext)) {
            return {
              title: `Blocked skill: ${params.name}`,
              output: [
                `<browser_code_skill_blocked name="${params.name}">`,
                "This skill is not allowed in the current Browser Code ProReader phase.",
                "For non-URL research, call ProReader first and use only the execution-backend skills selected by its plan.",
                "</browser_code_skill_blocked>",
              ].join("\n"),
            metadata: {
              name: params.name,
              blocked: true,
              phase: browserCodeCoreContext?.phase,
              dir: "",
            },
          }
          }

          const info = yield* skill
            .require(params.name)
            .pipe(Effect.catchTag("Skill.NotFoundError", (error) => Effect.die(new Error(error.message))))

          yield* ctx.ask({
            permission: "skill",
            patterns: [params.name],
            always: [params.name],
            metadata: {},
          })

          const dir = path.dirname(info.location)
          const base = dir
          const files = yield* ripgrep.find({
            cwd: dir,
            pattern: "!**/SKILL.md",
            hidden: true,
            follow: false,
            signal: ctx.abort,
            limit: 10,
          })

          return {
            title: `Loaded skill: ${info.name}`,
            output: [
              `<skill_content name="${info.name}">`,
              `# Skill: ${info.name}`,
              "",
              info.content.trim(),
              "",
              `Base directory for this skill: ${base}`,
              "Relative paths in this skill (e.g., scripts/, reference/) are relative to this base directory.",
              "Note: file list is sampled.",
              "",
              "<skill_files>",
              files.map((file) => `<file>${path.resolve(dir, file.path)}</file>`).join("\n"),
              "</skill_files>",
              "</skill_content>",
            ].join("\n"),
            metadata: {
              name: info.name,
              dir,
              blocked: false,
              phase: browserCodeCoreContext?.phase,
            },
          }
        }).pipe(Effect.orDie),
    }
  }),
)
