import Joi from 'joi';
const presencePlugin = {
    name: 'presence',
    dependencies: ['storage'],
    register: async (server) => {
        server.route({
            method: 'GET',
            path: '/api/presence-items',
            handler: async (request, h) => {
            }
        });
        server.route({
            method: 'POST',
            path: '/api/presence-item/{item}/states',
            options: {
                validate: {
                    params: {
                        item: Joi.string().pattern(/^[a-zA-Z_0-9]+$/)
                    },
                    payload: Joi.object({
                        presence: Joi.array()
                            .items(Joi.string().alphanum().required())
                            .min(1)
                            .optional(),
                        absence: Joi.array()
                            .items(Joi.string().alphanum().required())
                            .min(1)
                            .optional()
                    }).min(1)
                }
            },
            handler: async (request, h) => {
            }
        });
        server.route({
            method: 'DELETE',
            path: '/api/presence-item/{item}/states',
            options: {
                validate: {
                    params: {
                        item: Joi.string().pattern(/^[a-zA-Z_0-9]+$/)
                    }
                }
            },
            handler: async (request, h) => {
            }
        });
    }
};
export default presencePlugin;
//# sourceMappingURL=presence.js.map