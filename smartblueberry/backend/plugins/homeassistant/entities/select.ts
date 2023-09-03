import * as hapi from '@hapi/hapi'
import { Base } from './base.js'

export interface SelectParams {
  name: string
  icon: string
  initial?: string
  options: string[]
}

class Select extends Base {
  constructor(server: hapi.Server) {
    super(server, 'input_select')
  }

  /**
   * Upserts an select entity.
   * @param entityId The id of the entity.
   * @param params The parameters of the select entity.
   * @returns The upserted select entity.
   */
  public async upsert(entityId: string, params: SelectParams) {
    try {
      return await this.create(entityId, params)
    } catch {
      return await this.update(entityId, params)
    }
  }

  /**
   * Creates an select entity.
   * @param entityId The id of the entity.
   * @param params The parameters of the select entity.
   * @returns The created select entity.
   */
  public async create(entityId: string, params: SelectParams) {
    const connection = await this.server.plugins.hassConnect.globalConnect()

    if (await this.server.app.hassRegistry.hasEntity(entityId)) {
      throw new Error(`${entityId} already exists!`)
    }

    const result = (await connection?.sendMessagePromise({
      type: 'input_select/create',
      ...params,
      name: this.getObjectId(entityId, true)
    })) as { id: string }

    const createdEntityId = this.server.app.hassSelect.getEntityId(
      result.id,
      true
    )

    return this.update(createdEntityId, params)
  }

  /**
   * Updates an select entity.
   * @param entityId The id of the entity.
   * @param params The parameters of the select entity.
   * @returns The updated select entity.
   */
  public async update(
    entityId: string,
    params: Partial<SelectParams>
  ): Promise<(SelectParams & { id: string }) | undefined> {
    const connection = await this.server.plugins.hassConnect.globalConnect()
    return await connection?.sendMessagePromise({
      type: 'input_select/update',
      input_select_id: this.getObjectId(entityId, true),
      ...params
    })
  }

  /**
   * Deletes an select entity.
   * @param entityId The id of the entity.
   * @returns Promise resolves when the entity has been deleted.
   */
  public async delete(entityId: string): Promise<void> {
    const connection = await this.server.plugins.hassConnect.globalConnect()
    await connection?.sendMessagePromise({
      type: 'input_select/delete',
      input_select_id: this.getObjectId(entityId, true)
    })
  }

  /**
   * Selects an option in an select entity.
   * @param entityId The id of the select entity.
   * @param optionId The id of the option
   * @returns Promise resolves when the option has been selected.
   */
  public async select(entityId: string, option: string): Promise<void> {
    this.server.app.hassRegistry.callService('input_select', 'select_option', {
      target: { entity_id: entityId },
      service_data: { option }
    })
  }
}

declare module '@hapi/hapi' {
  interface ServerApplicationState {
    hassSelect: Select
  }
}

const hassSelectPlugin: hapi.Plugin<{}> = {
  name: 'hassSelect',
  dependencies: ['hassRegistry', 'hassConnect', 'options'],
  register: async (server: hapi.Server) => {
    server.app.hassSelect = new Select(server)
  }
}

export default hassSelectPlugin
