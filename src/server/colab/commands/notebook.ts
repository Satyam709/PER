/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import vscode, { QuickPickItem } from 'vscode';
import { InputFlowAction } from '../../../common/multi-step-quickpick';
import { AssignmentManager } from '../../../jupyter/assignments';
import { MOUNT_SERVER, REMOVE_SERVER } from '../../commands/constants';
import { CUSTOM_INSTANCE } from '../../custom-instance/commands/constants';
import { COLAB_SUBMENU, OPEN_COLAB_WEB } from './constants';
import { openColabWeb } from './external';
import { commandThemeIcon } from './utils';

/**
 * Prompt the user to select a PER command to run.
 *
 * Shows the main menu with Colab and Custom Instance options.
 */
export async function notebookToolbar(
  vs: typeof vscode,
  assignments: AssignmentManager,
): Promise<void> {
  const commands = getMainMenuCommands(vs, assignments);
  const command = await vs.window.showQuickPick<NotebookCommand>(commands, {
    title: 'PER',
  });
  if (!command) {
    return;
  }

  try {
    await command.invoke();
  } catch (err: unknown) {
    // The back button was pressed, pop this notebook toolbar quick pick again.
    if (err === InputFlowAction.back) {
      await notebookToolbar(vs, assignments);
      return;
    }
    throw err;
  }
}

/**
 * Show the Colab submenu with available Colab options.
 */
export async function colabSubmenu(
  vs: typeof vscode,
  assignments: AssignmentManager,
): Promise<void> {
  const commands = await getColabSubmenuCommands(vs, assignments);
  const command = await vs.window.showQuickPick<NotebookCommand>(commands, {
    title: 'PER > Colab',
  });
  if (!command) {
    return;
  }

  try {
    await command.invoke();
  } catch (err: unknown) {
    // The back button was pressed, go back to main menu.
    if (err === InputFlowAction.back) {
      await notebookToolbar(vs, assignments);
      return;
    }
    throw err;
  }
}

/**
 * Show the Custom Instance submenu.
 */
export async function customInstanceSubmenu(
  vs: typeof vscode,
  _assignments: AssignmentManager,
): Promise<void> {
  await vs.window.showInformationMessage(
    'Custom Instance feature is coming soon!',
  );
}

interface NotebookCommand extends QuickPickItem {
  invoke: () => Thenable<void> | void;
}

/**
 * Get the main menu commands for PER.
 */
function getMainMenuCommands(
  vs: typeof vscode,
  assignments: AssignmentManager,
): NotebookCommand[] {
  return [
    {
      label: COLAB_SUBMENU.label,
      iconPath: commandThemeIcon(vs, COLAB_SUBMENU),
      description: 'Access Colab server options',
      invoke: () => {
        return colabSubmenu(vs, assignments);
      },
    },
    {
      label: CUSTOM_INSTANCE.label,
      iconPath: commandThemeIcon(vs, CUSTOM_INSTANCE),
      description: 'Connect to custom Jupyter instance',
      invoke: () => {
        return customInstanceSubmenu(vs, assignments);
      },
    },
  ];
}

/**
 * Get the Colab submenu commands.
 */
async function getColabSubmenuCommands(
  vs: typeof vscode,
  assignments: AssignmentManager,
): Promise<NotebookCommand[]> {
  const colabCommands: NotebookCommand[] = [
    {
      label: OPEN_COLAB_WEB.label,
      iconPath: commandThemeIcon(vs, OPEN_COLAB_WEB),
      invoke: () => {
        openColabWeb(vs);
      },
    },
  ];

  if (!(await assignments.hasAssignedServer())) {
    return colabCommands;
  }

  const serverCommands: NotebookCommand[] = [];
  const includeMountServer = vs.workspace
    .getConfiguration('per')
    .get<boolean>('serverMounting', false);
  if (includeMountServer) {
    serverCommands.push({
      label: MOUNT_SERVER.label,
      iconPath: commandThemeIcon(vs, MOUNT_SERVER),
      description: MOUNT_SERVER.description,
      invoke: () => {
        return vs.commands.executeCommand(
          MOUNT_SERVER.id,
          /* withBackButton= */ true,
        );
      },
    });
  }
  serverCommands.push(
    // TODO: Include the rename server alias command once rename is reflected in
    // the recent kernels list. See https://github.com/microsoft/vscode-jupyter/issues/17107.
    {
      label: REMOVE_SERVER.label,
      iconPath: commandThemeIcon(vs, REMOVE_SERVER),
      invoke: () => {
        return vs.commands.executeCommand(
          REMOVE_SERVER.id,
          /* withBackButton= */ true,
        );
      },
    },
  );

  const separator: NotebookCommand = {
    label: '',
    kind: vs.QuickPickItemKind.Separator,
    invoke: () => {
      // Not selectable.
    },
  };

  return [...serverCommands, separator, ...colabCommands];
}
