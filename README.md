# Paradox Effects (PxFx)

This is a multi-modal media and effect controller.  It is intended to act as an inteface between mqtt messages and various other applications running on a machine such as:

- Media players like cvlc and mpv.
- Screen buffers like fbi and feh.
- Smart lights like Philips Hue and WiZ.
- Other automation controllers, as added later.

The configuration will be set with the following JSON compatable configuration files:

- pxfx-interfaces.json = Defines the avaliable apps that will be controlled.
- pxfx-topics.json = which controllers are attached to each prop topic.

When launching external applications, such as media players, this controller will maintain a connection so that it can send additional commands.

## Avaliable Commands

### Media Players

The following is a summary of the 

### Light Controllers


## MQTT Topic and Command Structures

The MQTT topics will be organized as follows, where BASE is the base topic is defined for a type of controller:

### Media Player Topics and Commands

PROP is the topic for a specific media controller, which will be served by whichever media controller is set in the px-interfaces.json file.  The following topics will automatically be generated:

- PROP/command is the topic to subscribe to for incoming media commands.
- PROP/events is the topic to publish normal status messages to.
- PROP/warnings is the topic to publish errors and exceptions to.

Additionally, every time there is a warning published it will be duplicated to a special topic WARNINGS that will be common for all devices in a given setup.  Messages plublished to this topic will also include the PROP topic appened at the end of the JSON ball.

### Light Effect Players and Topics

#### Topic Maping
GROUP is the topic for a specific groups of lights, which will be served by whichever controller or controllers are attached to it.  LIGHT is a specific light in a GROUP.  If a command is sent to a GROUP without specifying one or more LIGHTs (multiple allowed) then all lights in the group will respond.  When one or more lights is included in the command, it will be applied to only those lights.

When configuring the pxfx-topics.json file, more than one lighting controller can be used per GROUP, but only one controller per LIGHT.  The mapping is that each LIGHT is configured to use one of the automation controllers, and then that LIGHT is mapped to only one GROUP.  Therefore two LIGHT with the same name but different GROUP will be considered different lights.  

If more than one controller is attached to a single topic, then each LIGHT will respond to whatever commands it understands and ignores the others. However, if "groups" or "rooms" are supported by the external API's then a LIGHT could be a group/room as defined in the external API.

#### Effect Macros and Scripts

With lighting, some external controllers may support "scenes" or "automations" but they are unlikely to match across various models and brands.  Therefore we will support some pre-defined macros and scripts that handle some common automations across multiple types of controllers.  The following will be included, and can be extended by updates to this software.

- FADE = (target color and brightness, trasnition duration)
- BLINK = (target on color and brightness, duration on, duration off, transition duration) 
- FLIP = (target color 1, target color 2, etc., duration on, duration off, transition duration)
- DISCO = (target brightness, duration between triggers, transition duration, synced or not)
- FLAME = (target brightness and color, synced or not)
- MORSE = (target on color and brightness, dot duration)

NOTE: "synced or not" refers to whether individual lights in a group are locked to the same brightness and color or are sent different commands.

For Neopixel type devices we will only support them as solid strip or by indivicually addressing single LEDs on a strip.






## Getting started

To make it easy for you to get started with GitLab, here's a list of recommended next steps.

Already a pro? Just edit this README.md and make it your own. Want to make it easy? [Use the template at the bottom](#editing-this-readme)!

## Add your files

- [ ] [Create](https://docs.gitlab.com/ee/user/project/repository/web_editor.html#create-a-file) or [upload](https://docs.gitlab.com/ee/user/project/repository/web_editor.html#upload-a-file) files
- [ ] [Add files using the command line](https://docs.gitlab.com/ee/gitlab-basics/add-file.html#add-a-file-using-the-command-line) or push an existing Git repository with the following command:

```
cd existing_repo
git remote add origin https://gitlab.gnurdle.com/paradox/pxfx.git
git branch -M main
git push -uf origin main
```

## Integrate with your tools

- [ ] [Set up project integrations](https://gitlab.gnurdle.com/paradox/pxfx/-/settings/integrations)

## Collaborate with your team

- [ ] [Invite team members and collaborators](https://docs.gitlab.com/ee/user/project/members/)
- [ ] [Create a new merge request](https://docs.gitlab.com/ee/user/project/merge_requests/creating_merge_requests.html)
- [ ] [Automatically close issues from merge requests](https://docs.gitlab.com/ee/user/project/issues/managing_issues.html#closing-issues-automatically)
- [ ] [Enable merge request approvals](https://docs.gitlab.com/ee/user/project/merge_requests/approvals/)
- [ ] [Set auto-merge](https://docs.gitlab.com/ee/user/project/merge_requests/merge_when_pipeline_succeeds.html)

## Test and Deploy

Use the built-in continuous integration in GitLab.

- [ ] [Get started with GitLab CI/CD](https://docs.gitlab.com/ee/ci/quick_start/index.html)
- [ ] [Analyze your code for known vulnerabilities with Static Application Security Testing (SAST)](https://docs.gitlab.com/ee/user/application_security/sast/)
- [ ] [Deploy to Kubernetes, Amazon EC2, or Amazon ECS using Auto Deploy](https://docs.gitlab.com/ee/topics/autodevops/requirements.html)
- [ ] [Use pull-based deployments for improved Kubernetes management](https://docs.gitlab.com/ee/user/clusters/agent/)
- [ ] [Set up protected environments](https://docs.gitlab.com/ee/ci/environments/protected_environments.html)

***

# Editing this README

When you're ready to make this README your own, just edit this file and use the handy template below (or feel free to structure it however you want - this is just a starting point!). Thanks to [makeareadme.com](https://www.makeareadme.com/) for this template.

## Suggestions for a good README

Every project is different, so consider which of these sections apply to yours. The sections used in the template are suggestions for most open source projects. Also keep in mind that while a README can be too long and detailed, too long is better than too short. If you think your README is too long, consider utilizing another form of documentation rather than cutting out information.

## Name
Choose a self-explaining name for your project.

## Description
Let people know what your project can do specifically. Provide context and add a link to any reference visitors might be unfamiliar with. A list of Features or a Background subsection can also be added here. If there are alternatives to your project, this is a good place to list differentiating factors.

## Badges
On some READMEs, you may see small images that convey metadata, such as whether or not all the tests are passing for the project. You can use Shields to add some to your README. Many services also have instructions for adding a badge.

## Visuals
Depending on what you are making, it can be a good idea to include screenshots or even a video (you'll frequently see GIFs rather than actual videos). Tools like ttygif can help, but check out Asciinema for a more sophisticated method.

## Installation
Within a particular ecosystem, there may be a common way of installing things, such as using Yarn, NuGet, or Homebrew. However, consider the possibility that whoever is reading your README is a novice and would like more guidance. Listing specific steps helps remove ambiguity and gets people to using your project as quickly as possible. If it only runs in a specific context like a particular programming language version or operating system or has dependencies that have to be installed manually, also add a Requirements subsection.

## Usage
Use examples liberally, and show the expected output if you can. It's helpful to have inline the smallest example of usage that you can demonstrate, while providing links to more sophisticated examples if they are too long to reasonably include in the README.

## Support
Tell people where they can go to for help. It can be any combination of an issue tracker, a chat room, an email address, etc.

## Roadmap
If you have ideas for releases in the future, it is a good idea to list them in the README.

## Contributing
State if you are open to contributions and what your requirements are for accepting them.

For people who want to make changes to your project, it's helpful to have some documentation on how to get started. Perhaps there is a script that they should run or some environment variables that they need to set. Make these steps explicit. These instructions could also be useful to your future self.

You can also document commands to lint the code or run tests. These steps help to ensure high code quality and reduce the likelihood that the changes inadvertently break something. Having instructions for running tests is especially helpful if it requires external setup, such as starting a Selenium server for testing in a browser.

## Authors and acknowledgment
Show your appreciation to those who have contributed to the project.

## License
For open source projects, say how it is licensed.

## Project status
If you have run out of energy or time for your project, put a note at the top of the README saying that development has slowed down or stopped completely. Someone may choose to fork your project or volunteer to step in as a maintainer or owner, allowing your project to keep going. You can also make an explicit request for maintainers.
