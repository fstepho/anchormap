import { formatLabel } from "@/lib/format";

export interface ButtonProps {
	label: string;
}

export function Button({ label }: ButtonProps) {
	return <button type="button">{formatLabel(label)}</button>;
}
