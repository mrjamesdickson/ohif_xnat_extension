# Gemini Customization

This file helps customize Gemini's behavior for this project.

## Project-Specific Instructions

- When deploying the extension, always copy the local `config/pluginConfig.json` file to the OHIF viewer directory. Do not modify the `pluginConfig.json` file in the OHIF viewer directory directly.

You can provide Gemini with specific instructions about this project. For example:

- "When I ask you to create a new component, please follow the structure of the existing components in `src/components`."
- "Please use the `XNATDataSource` for all data fetching."

## Custom Tools

You can define custom tools that Gemini can use to help you with your tasks. For example:

```
tool
name: "create_new_component"
description: "Creates a new component in the `src/components` directory."
args:
  - name: "component_name"
    type: "string"
    description: "The name of the new component."
script: "mkdir src/components/{{component_name}}"
```
