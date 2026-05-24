import { DependencyContainer } from "tsyringe"
import { DatabaseServer } from "@spt/servers/DatabaseServer"
import { ScavCaseOptions } from "../types"
import { IDatabaseTables } from "@spt/models/spt/server/IDatabaseTables"
import { PrefixLogger } from "../util/PrefixLogger"
import { ConfigServer } from "@spt/servers/ConfigServer"
import { ConfigTypes } from "@spt/models/enums/ConfigTypes"
import { IScavCaseConfig } from "@spt/models/spt/config/IScavCaseConfig"
import { BaseClasses } from "@spt/models/enums/BaseClasses"
import { HandbookHelper } from "@spt/helpers/HandbookHelper"
import { ScavCaseRewardGenerator } from "@spt/generators/ScavCaseRewardGenerator"
import { scavcaseRewardItemValueRangeRubReworked, scavCaseRecipesReworked, scavcaseWhitelist, scavcaseItemBlacklist } from "../assets/scavcase"
import { Traders } from "@spt/models/enums/Traders"
import { ItemFilterService } from "@spt/services/ItemFilterService"
import { SeasonalEventService } from "@spt/services/SeasonalEventService"
import { ItemHelper } from "@spt/helpers/ItemHelper"

import { ItemTpl } from "@spt/models/enums/ItemTpl"

export class ScavCaseOptionsChanger {
	private logger: PrefixLogger
	private tables: IDatabaseTables
	private scavCaseConfig: IScavCaseConfig
	private handbookHelper: HandbookHelper
	private itemFilterService: ItemFilterService
	private seasonalEventService: SeasonalEventService
	private itemHelper: ItemHelper

	constructor(container: DependencyContainer) {
		this.logger = PrefixLogger.getInstance()
		const databaseServer = container.resolve<DatabaseServer>("DatabaseServer")
		const configServer = container.resolve<ConfigServer>("ConfigServer")
		this.handbookHelper = container.resolve<HandbookHelper>("HandbookHelper")
		this.itemFilterService = container.resolve<ItemFilterService>("ItemFilterService")
		this.seasonalEventService = container.resolve<SeasonalEventService>("SeasonalEventService")
		this.itemHelper = container.resolve<ItemHelper>("ItemHelper")
		this.tables = databaseServer.getTables()
		this.scavCaseConfig = configServer.getConfig<IScavCaseConfig>(ConfigTypes.SCAVCASE)
	}

	public apply(config: ScavCaseOptions) {
		if (!config.enabled) {
			return
		}

		try {
			if (config.betterRewards) {
				this.doBetterRewards()
			}
		} catch (error) {
			this.logger.warning("ScavCaseOptions: doBetterRewards markedKeys failed gracefully. Send bug report. Continue safely.")
			console.warn(error)
		}

		try {
			if (config.rebalance) {
				this.doRebalance()
			}
		} catch (error) {
			this.logger.warning("ScavCaseOptions: doRebalance markedKeys failed gracefully. Send bug report. Continue safely.")
			console.warn(error)
		}

		try {
			if (config.fasterScavcase.enabled) {
				this.doFasterScavcase(config.fasterScavcase.speedMultiplier)
			}
		} catch (error) {
			this.logger.warning("ScavCaseOptions: doFasterScavcase markedKeys failed gracefully. Send bug report. Continue safely.")
			console.warn(error)
		}

		// this.debug()
	}

	private doBetterRewards() {
		// Set of all buyable items
		const buyableitems = new Set<string>()
		const traderlist = this.tables.traders
		const templatesItems = this.tables.templates!.items
		const handbook = this.tables.templates!.handbook

		for (const [traderID, trader] of Object.entries(traderlist)) {
			if (traderID === Traders.LIGHTHOUSEKEEPER) {
				continue
			}
			const assortItems = trader.assort?.items
			if (!assortItems) {
				this.logger.warning(`ScavCaseOptionsChanger: doBetterRewards: trader.assort.items for trader ${traderID} not found`)
				continue
			}
			for (const x of assortItems) {
				if (templatesItems[x._tpl]?._parent !== "65649eb40bf0ed77b8044453") {
					buyableitems.add(x._tpl)
				}
			}
		}

		this.scavCaseConfig.rewardItemParentBlacklist = [
			// stock:
			"5485a8684bdc2da71d8b4567", // Ammo
			"543be5dd4bdc2deb348b4569", // Money
			"5448bf274bdc2dfc2f8b456a", // Port. container
			"5d52cc5ba4b9367408500062", // AGS-30 30x29mm automatic grenade launcher
			"62f109593b54472778797866", // RandomLootContainer
			"65649eb40bf0ed77b8044453", // BuiltInInserts
		]

		for (const item of Object.values(templatesItems)) {
			if (item._type !== "Item") {
				continue
			}

			let handbookPrice = this.handbookHelper.getTemplatePrice(item._id)

			// Ammo boxes price patch - their data in handbook is always 1k
			if (item._parent === "543be5cb4bdc2deb348b4568") {
				try {
					const count = item._props?.StackSlots?.[0]?._max_count
					const ammo = item._props?.StackSlots?.[0]?._props?.filters?.[0]?.Filter?.[0]
					if (count && ammo) {
						const value = Math.round(this.handbookHelper.getTemplatePrice(ammo) * count)
						handbookPrice = value
						const ammoboxHandbook = handbook.Items.find((x) => x.Id === item._id)
						if (ammoboxHandbook) {
							ammoboxHandbook.Price = value
						}
					}
				} catch (error) {
					this.logger.warning("Ammo box price fix failed for item. Ignore and continue.")
				}
			}

			if (
				this.scavCaseItemFilter(item._id) &&
				(!buyableitems.has(item._id) || handbookPrice >= 10000 || scavcaseWhitelist.includes(item._parent))
			) {
				// whitelisted, do nothing
			} else {
				this.scavCaseConfig.rewardItemBlacklist.push(item._id)
			}
		}
	}

	private scavCaseItemFilter(itemID) {
		const items = this.tables.templates!.items
		const item = items![itemID]

		if (item._parent === "") {
			return false
		}

		if (item._type === "Node") {
			return false
		}

		if (item._props.QuestItem === true) {
			return false
		}

		if (scavcaseItemBlacklist.includes(itemID)) {
			return false
		}

		if (this.itemFilterService.isItemBlacklisted(itemID)) {
			return false
		}

		if (this.itemFilterService.isBossItem(itemID)) {
			return false
		}

		if (this.itemFilterService.isItemRewardBlacklisted(itemID)) {
			return false
		}

		if (this.seasonalEventService.itemIsSeasonalRelated(itemID)) {
			return false
		}

		if (this.handbookHelper.getTemplatePrice(itemID) < 2) {
			return false
		}

		//	if (this.itemHelper.isOfBaseclasses(itemID, this.scavCaseConfig.rewardItemParentBlacklist)) {
		// // if enabled, this pushes all AMMO to scavCaseConfig.rewardItemBlacklist and it breaks SPT rewards ammogenerator. this was done as a failsafe, so should be ok to disable this check.
		//		return false
		//	}
		//		if (
		//			item._parent == BaseClasses.POCKETS ||
		//			item._parent == BaseClasses.HIDEOUT_AREA_CONTAINER ||
		//			item._parent == BaseClasses.LOOT_CONTAINER ||
		//			item._parent == BaseClasses.POCKETS ||
		//			item._parent == BaseClasses.STASH ||
		//			item._parent == "6672e40ebb23210ae87d39eb" ||
		//			item._parent == BaseClasses.OTHER
		//		) {
		//			console.log(
		//				`"${item._parent}", // ${items[item._parent]._name} --- "${item._id}", // ${
		//					this.tables.locales?.global.en[`${item._id} Name`]
		//				}: ${this.handbookHelper.getTemplatePrice(item._id)}, `
		//			)
		//		}
		return true
	}

	private doFasterScavcase(multiplier: number) {
		for (const [_, recipe] of Object.entries(this.tables.hideout!.production.scavRecipes)) {
			recipe.productionTime = Math.round(recipe.productionTime / multiplier)
		}
	}

	private doRebalance() {
		this.scavCaseConfig.rewardItemValueRangeRub = scavcaseRewardItemValueRangeRubReworked
		this.tables.hideout!.production.scavRecipes = scavCaseRecipesReworked
	}

	private debug() {
		for (const [_, recipe] of Object.entries(this.tables.hideout!.production.scavRecipes)) {
			// console.log(recipe)
			recipe.requirements[0].templateId = ItemTpl.MONEY_ROUBLES
			recipe.productionTime = 3 // doesn't work for DEV account, SPT has forced check "this.profileHelper.isDeveloperAccount(sessionID) ? 40 : modifiedScavCaseTime". Need to manually modify profile edition string after creation.
		}
	}
}
