import { DependencyContainer } from "tsyringe"
import { FuelConsumption } from "../types"
import { BaseChanger } from "./BaseChanger"

export class FuelConsumptionChanger extends BaseChanger {
	constructor(container: DependencyContainer) {
		super(container)
	}

	public apply(config: FuelConsumption) {
		if (!config.enabled) {
			return
		}
		try {
			this.doChangeFuelConsumption(config.fuelConsumptionMultiplier)
		} catch (error) {
			this.logger.warning("FuelConsumption: doChangeFuelConsumption failed gracefully. Send bug report. Continue safely.")
			console.warn(error)
		}
	}

	private doChangeFuelConsumption(multiplier: number) {
		const hideout = this.tables.hideout
		hideout!.settings.generatorFuelFlowRate *= multiplier // сука. 33 строчки чтобы изменить одну переменную.
	}
}
