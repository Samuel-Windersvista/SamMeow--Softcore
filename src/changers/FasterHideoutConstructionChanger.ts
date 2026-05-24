import { DependencyContainer } from "tsyringe"
import { FasterHideoutConstruction } from "../types"
import { BaseChanger } from "./BaseChanger"

export class FasterHideoutConstructionChanger extends BaseChanger {
	constructor(container: DependencyContainer) {
		super(container)
	}

	public apply(config: FasterHideoutConstruction) {
		if (!config.enabled) {
			return
		}
		try {
			this.doFasterHideoutConstruction(config.hideoutConstructionTimeMultiplier)
		} catch (error) {
			this.logger.warning("FasterHideoutConstruction: doFasterHideoutConstruction failed gracefully. Send bug report. Continue safely.")
			console.warn(error)
		}
	}

	private doFasterHideoutConstruction(multiplier: number) {
		const hideout = this.tables.hideout

		for (const area of hideout!.areas) {
			for (const [_, stage] of Object.entries(area.stages)) {
				stage.constructionTime = Math.round(stage.constructionTime / multiplier)
			}
		}
	}
}
