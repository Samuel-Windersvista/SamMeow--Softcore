import { DependencyContainer } from "tsyringe"
import { DatabaseServer } from "@spt/servers/DatabaseServer"
import { IDatabaseTables } from "@spt/models/spt/server/IDatabaseTables"
import { PrefixLogger } from "../util/PrefixLogger"

/**
 * Base class for all Softcore changers.
 * Provides common logger and database table access.
 */
export class BaseChanger {
	protected logger: PrefixLogger
	protected tables: IDatabaseTables

	constructor(container: DependencyContainer) {
		this.logger = PrefixLogger.getInstance()
		this.tables = container.resolve<DatabaseServer>("DatabaseServer").getTables()
	}
}
