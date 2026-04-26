import { externalValue } from "external-package";
import { dep } from "./dep";

export const value = dep + Number(Boolean(externalValue));
