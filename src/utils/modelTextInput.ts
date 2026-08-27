import type { ModelInputDef, RequiredModelParameter } from "@/types";

/** Common provider names for a model's primary free-form text input. */
export const PRIMARY_TEXT_INPUT_NAMES = ["prompt", "text", "input_text"] as const;

const TEXT_INPUT_NAMES = new Set([
  ...PRIMARY_TEXT_INPUT_NAMES,
  "negative_prompt",
  "preview_text",
  "script",
  "dialogue",
  "caption",
  "transcript",
  "lyrics",
  "system_prompt",
  "style_prompt",
]);

export interface ModelTextInputSource {
  inputSchema?: ModelInputDef[];
  requiredModelParameters?: RequiredModelParameter[];
  parameters?: Record<string, unknown>;
}

export interface ModelTextInput {
  name: string;
  label: string;
}

function generatedLabel(name: string): string {
  return name
    .replace(/_url$/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

/** Find the primary text field, even for legacy nodes without inputSchema. */
export function getPrimaryTextInput(source: ModelTextInputSource): ModelTextInput | null {
  const textInputs = (source.inputSchema ?? []).filter((input) => input.type === "text");
  const schemaInput =
    textInputs.find((input) =>
      PRIMARY_TEXT_INPUT_NAMES.includes(input.name as (typeof PRIMARY_TEXT_INPUT_NAMES)[number])
    ) ?? textInputs[0];
  if (schemaInput) {
    return { name: schemaInput.name, label: schemaInput.label || generatedLabel(schemaInput.name) };
  }

  const requiredInput = (source.requiredModelParameters ?? []).find((input) =>
    TEXT_INPUT_NAMES.has(input.name)
  );
  if (requiredInput) {
    return { name: requiredInput.name, label: requiredInput.label || generatedLabel(requiredInput.name) };
  }

  const parameterName = Object.keys(source.parameters ?? {}).find((name) => TEXT_INPUT_NAMES.has(name));
  if (parameterName) {
    return { name: parameterName, label: generatedLabel(parameterName) };
  }

  return null;
}

/** Read a text value while tolerating the array shape used by batch inputs. */
export function readTextInputValue(value: unknown): string | null {
  if (Array.isArray(value)) return readTextInputValue(value[0]);
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Resolve the inline value for the model's primary text field. */
export function getInlineTextInputValue(source: ModelTextInputSource): string | null {
  const primary = getPrimaryTextInput(source);
  const candidateNames = [
    primary?.name,
    ...(source.inputSchema ?? [])
      .filter((input) => input.type === "text")
      .map((input) => input.name),
    ...(source.requiredModelParameters ?? [])
      .filter((input) => TEXT_INPUT_NAMES.has(input.name))
      .map((input) => input.name),
    ...Object.keys(source.parameters ?? {}).filter((name) => TEXT_INPUT_NAMES.has(name)),
  ].filter((name): name is string => Boolean(name));

  for (const name of new Set(candidateNames)) {
    const value = readTextInputValue(source.parameters?.[name]);
    if (value !== null) return value;
  }
  return null;
}
