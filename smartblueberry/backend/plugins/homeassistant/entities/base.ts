import * as hapi from '@hapi/hapi'

export abstract class Base {
  constructor(protected server: hapi.Server, private entityDomain: string) {}

  /**
   * Gets the entityId of a given objectId. The entityId is defined as `<domain>.<prefix><objectId>`.
   * @param objectId The objectId of the entity.
   * @param isPrefixed True, if the objectId is prefixed with the domain already.
   * @returns The entityId of the entity.
   */
  public getEntityId(objectId: string, isPrefixed = false) {
    return `${this.entityDomain}.${
      isPrefixed ? '' : `${this.server.plugins.options.prefix}_`
    }${objectId}`
  }

  /**
   * Gets the objectId of a given entityId. The entityId is defined as `<domain>.<prefix><objectId>`.
   * @param entityId The entityId of the entity.
   * @param keepPrefix True, if the ojectId should keep the prefix.
   * @returns The objectId of the entity.
   */
  protected getObjectId(entityId: string, keepPrefix = false) {
    const prefix = `${this.entityDomain}.${
      keepPrefix ? '' : `${this.server.plugins.options.prefix}_`
    }`
    if (!entityId.startsWith(prefix)) {
      throw new Error(`${entityId} is not of domain "${prefix}"!`)
    }
    return entityId.replace(prefix, '')
  }
}
