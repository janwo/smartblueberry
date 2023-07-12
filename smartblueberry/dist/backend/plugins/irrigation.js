import Joi from 'joi';
const irrigationPlugin = {
    name: 'irrigation',
    dependencies: ['storage'],
    register: async (server) => {
        server.route({
            method: 'GET',
            path: '/api/irrigation-api',
            handler: async (request, h) => {
                server.route({
                    method: 'POST',
                    path: '/api/irrigation-api',
                    options: {
                        validate: {
                            payload: {
                                apiSettings: Joi.object({
                                    syncLocation: Joi.boolean().optional(),
                                    apiKey: Joi.string()
                                        .pattern(/^[a-zA-Z_0-9]+$/)
                                        .optional()
                                }).min(1)
                            }
                        }
                    },
                    handler: async (request, h) => {
                    }
                });
                server.route({
                    method: 'GET',
                    path: '/api/irrigation-valve-items',
                    handler: async (request, h) => {
                    }
                });
                server.route({
                    method: 'POST',
                    path: '/api/irrigation-valve-items/{item}',
                    options: {
                        validate: {
                            params: {
                                item: Joi.string().pattern(/^[a-zA-Z_0-9]+$/)
                            },
                            payload: {
                                irrigationValues: Joi.object({
                                    irrigationLevelPerMinute: Joi.number().min(0).required(),
                                    overshootDays: Joi.number().min(0).required(),
                                    evaporationFactor: Joi.number().min(0).required(),
                                    minimalTemperature: Joi.string()
                                        .regex(/\d*[FC]/)
                                        .optional(),
                                    observedDays: Joi.number().min(0).required()
                                }).required()
                            }
                        }
                    },
                    handler: async (request, h) => {
                    }
                });
            }
        });
    }
};
export default irrigationPlugin;
//# sourceMappingURL=irrigation.js.map