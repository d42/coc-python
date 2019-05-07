// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict'

import { inject, injectable } from 'inversify'
import { Uri } from 'coc.nvim'
import { IInterpreterService, InterpreterType, IPoetryService } from '../../../interpreter/contracts'
import { IWorkspaceService } from '../../application/types'
import { IFileSystem } from '../../platform/types'
import { ITerminalActivationCommandProvider, TerminalShellType } from '../types'
import { workspace } from 'coc.nvim'
import { fileToCommandArgument } from '../../string'

@injectable()
export class PoetryActivationCommandProvider implements ITerminalActivationCommandProvider {
  constructor(
    @inject(IInterpreterService) private readonly interpreterService: IInterpreterService,
    @inject(IPoetryService) private readonly poetryService: IPoetryService,
    @inject(IWorkspaceService) private readonly workspaceService: IWorkspaceService,
    @inject(IFileSystem) private readonly fs: IFileSystem
  ) { }

  public isShellSupported(_targetShell: TerminalShellType): boolean {
    return false
  }

  public async getActivationCommands(resource: Uri | undefined, _: TerminalShellType): Promise<string[] | undefined> {
    const interpreter = await this.interpreterService.getActiveInterpreter(resource)
    if (!interpreter || interpreter.type !== InterpreterType.Poetry) {
      return
    }
    const execName = this.poetryService.executable
    return [`${fileToCommandArgument(execName)} shell`]
  }

  public async getActivationCommandsForInterpreter(pythonPath: string, _targetShell: TerminalShellType): Promise<string[] | undefined> {
    const interpreter = await this.interpreterService.getInterpreterDetails(pythonPath)
    if (!interpreter || interpreter.type !== InterpreterType.Poetry) {
      return
    }

    const execName = this.poetryService.executable
    return [`${fileToCommandArgument(execName)} shell`]
  }

}
