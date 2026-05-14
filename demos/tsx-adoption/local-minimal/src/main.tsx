import { App } from "@/App";

export function mountApplication(target: HTMLElement): void {
	target.dataset.anchorMapView = App().type;
}
