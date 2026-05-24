import { DependencyContainer } from "tsyringe"
import { FasterBitcoinFarming } from "../types"
import { ItemTpl } from "@spt/models/enums/ItemTpl"
import { BaseChanger } from "./BaseChanger"

export class FasterBitcoinFarmingChanger extends BaseChanger {
	constructor(container: DependencyContainer) {
		super(container)
	}

	public apply(config: FasterBitcoinFarming) {
		if (!config.enabled) {
			return
		}

		try {
			this.doFasterBitcoinFarming(config.baseBitcoinTimeMultiplier, config.gpuEfficiency)
		} catch (error) {
			this.logger.warning("FasterBitcoinFarming: doFasterBitcoinFarming failed gracefully. Send bug report. Continue safely.")
			console.warn(error)
		}

		try {
			if (config.setBitcoinPriceTo100k) {
				this.setBitcoinPriceTo100k()
			}
		} catch (error) {
			this.logger.warning("FasterBitcoinFarming: setBitcoinPriceTo100k failed gracefully. Send bug report. Continue safely.")
			console.warn(error)
		}
	}

	private doFasterBitcoinFarming(baseBitcoinTimeMultiplier: number, gpuEfficiency: number) {
		const hideout = this.tables.hideout
		const bitcoinProductions = hideout!.production.recipes.filter((production) => production.endProduct === ItemTpl.BARTER_PHYSICAL_BITCOIN)

		for (const prod of bitcoinProductions) {
			prod.productionTime = Math.round(prod.productionTime / baseBitcoinTimeMultiplier)
		}

		hideout!.settings.gpuBoostRate = gpuEfficiency
	}

	private setBitcoinPriceTo100k() {
		const bitcoinHandbook = this.tables.templates?.handbook.Items.find((item) => item.Id === ItemTpl.BARTER_PHYSICAL_BITCOIN)
		bitcoinHandbook!.Price = 100000
	}
}
