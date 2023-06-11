# <center>SmartBlueBerry 🫐 - Smart Home 🏡</center>

_<center>SmartBlueBerry is a Home Assistant environment providing multiple extensions to simplify the configuration of scenes, climate and security management.</center>_

## Features

Make use of the following features:

- Easily manage your lights 💡
  - Trigger lights by light conditions
  - Auto-on lights on presence
  - Simulate lights when away
  - Easy location-dependant configuration
- Heating Management 🔥
  - Different heating configurations for sleep, home and away states
  - Turn off all radiators automatically on open windows
- Presence Management 👋
  - Update your presence automatically
  - Apply your presence state to security, light and heating
- Security Features 🔒
  - Smoke and assault detection
  - Supports alarm and siren items
  - Close lock items automatically by window or door sensors
- Irrigation Management 🏡
  - Automatically irrigate an unlimited number of irrigation valves
  - Takes the weather forecast into account

All features are easily configurable without using a single line of code! SmartBlueBerry comes with an additonal configuration dashboard.

![Dashboard](.github/assets/dashboard.png)

## Getting Started

It is recommend to use SmartBlueBerry in a docker container using `docker compose`. The easiest way to do so, is a deployment of SmartBlueBerry via [balenaCloud](https://www.balena.io/cloud/). Just add the project to your balena applications and select a supported device. You also like to change the hostname of your device to `smartblueberry` - to do so, study these [notes](https://www.balena.io/docs/learn/develop/runtime/#change-the-device-hostname).

[![balena deploy button](https://www.balena.io/deploy.svg)](https://dashboard.balena-cloud.com/deploy?repoUrl=https%3A//github.com/janwo/SmartBlueBerry)

In order to adjust general settings of your SmartBlueBerry instance, you may add the following environment variables.

| Environment variable       | Description                                             |
| :------------------------- | :------------------------------------------------------ |
|  |
| `JWT_SECRET` (recommended) | Set a secret to salt your connection of openhab-helper. |

After starting up, SmartBlueBerry is available on port `8123`. To make SmartBlueBerry manage your home in its full potential, access the helper application on port `8234`. Please also refer to the documentation of [Home Assistant](https://www.openhab.org/docs/).

If you have any questions, join our [Discord server](https://discord.gg/xYypJZYYPY) or just let us know in the _Issues_.
