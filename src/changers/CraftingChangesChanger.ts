import { DependencyContainer } from "tsyringe"
import { CraftingChanges } from "../types"
import { BaseChanger } from "./BaseChanger"
import { HideoutAreas } from "@spt/models/enums/HideoutAreas"
import { ItemTpl } from "@spt/models/enums/ItemTpl"
import { craftingAdjustments } from "../assets/productionAdjustments"
import { IHideoutProduction } from "@spt/models/eft/hideout/IHideoutProduction"
import { additionalCraftingRecipes } from "../assets/recipes"

export class CraftingChangesChanger extends BaseChanger {
	constructor(container: DependencyContainer) {
		super(container)
	}

	public apply(config: CraftingChanges) {
		if (!config.enabled) {
			return
		}

		try {
			if (config.craftingRebalance) {
				this.doCraftingRebalance()
			}
		} catch (error) {
			this.logger.warning("CraftingChanges: doCraftingRebalance failed gracefully. Send bug report. Continue safely.")
			console.warn(error)
		}

		try {
			if (config.additionalCraftingRecipes) {
				this.doAdditionalCraftingRecipes()
			}
		} catch (error) {
			this.logger.warning("CraftingChanges: doAdditionalCraftingRecipes failed gracefully. Send bug report. Continue safely.")
			console.warn(error)
		}
	}

	private doCraftingRebalance() {
		for (const adjustment of craftingAdjustments) {
			const craft = this.getCraftByEndProduct(adjustment.id) as IHideoutProduction
			if (!craft) {
				this.logger.warning(`CraftingChangesChanger: doCraftingRebalance: craft not found, skipping ${adjustment.id}`)
				continue
			}
			adjustment.adjust(craft)
		}
	}

	private getCraftByEndProduct(endProductID: ItemTpl) {
		return this.tables.hideout?.production.recipes.find(
			(production) => production.endProduct === endProductID && production.areaType !== HideoutAreas.CHRISTMAS_TREE
		)
	}

	private doAdditionalCraftingRecipes() {
		this.tables.hideout?.production.recipes.push(...additionalCraftingRecipes)
	}
}
