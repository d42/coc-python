// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
import { Uri, workspace } from 'coc.nvim'
import { inject, injectable } from 'inversify'
import * as path from 'path'
import { IWorkspaceService } from '../../../common/application/types'
import { traceError } from '../../../common/logger'
import { IFileSystem, IPlatformService } from '../../../common/platform/types'
import { IProcessServiceFactory } from '../../../common/process/types'
import { IConfigurationService, ICurrentProcess, ILogger } from '../../../common/types'
import { IServiceContainer } from '../../../ioc/types'
import { IInterpreterHelper, InterpreterType, IPoetryService, PythonInterpreter } from '../../contracts'
import { CacheableLocatorService } from './cacheableLocatorService'

@injectable()
export class PoetryService extends CacheableLocatorService implements IPoetryService {
  private readonly helper: IInterpreterHelper
  private readonly processServiceFactory: IProcessServiceFactory
  private readonly workspace: IWorkspaceService
  private readonly fs: IFileSystem
  private readonly logger: ILogger
  private readonly configService: IConfigurationService

  constructor(@inject(IServiceContainer) serviceContainer: IServiceContainer) {
    super('PoetryService', serviceContainer, true)
    this.helper = this.serviceContainer.get<IInterpreterHelper>(IInterpreterHelper)
    this.processServiceFactory = this.serviceContainer.get<IProcessServiceFactory>(IProcessServiceFactory)
    this.workspace = this.serviceContainer.get<IWorkspaceService>(IWorkspaceService)
    this.fs = this.serviceContainer.get<IFileSystem>(IFileSystem)
    this.logger = this.serviceContainer.get<ILogger>(ILogger)
    this.configService = this.serviceContainer.get<IConfigurationService>(IConfigurationService)
  }
  // tslint:disable-next-line:no-empty
  public dispose() { }
  public async isRelatedPoetryEnvironment(dir: string, pythonPath: string): Promise<boolean> {
    // In Poetry, the name of the cwd is used as a prefix in the virtual env.
    if (pythonPath.indexOf(`${path.sep}${path.basename(dir)}-`) === -1) {
      return false
    }
    const envName = await this.getInterpreterPathFromPoetry(dir, true)
    return !!envName
  }

  public get executable(): string {
    return this.configService.getSettings().poetryPath
  }

  protected getInterpretersImplementation(resource?: Uri): Promise<PythonInterpreter[]> {
    const poetryCwd = this.getPoetryWorkingDirectory(resource)
    if (!poetryCwd) {
      return Promise.resolve([])
    }

    return this.getInterpreterFromPoetry(poetryCwd)
      .then(item => (item ? [item] : []))
      .catch(() => [])
  }

  private async getInterpreterFromPoetry(poetryCwd: string): Promise<PythonInterpreter | undefined> {
    const interpreterPath = await this.getInterpreterPathFromPoetry(poetryCwd)
    if (!interpreterPath) {
      return
    }

    const details = await this.helper.getInterpreterInformation(interpreterPath)
    if (!details) {
      return
    }
    this._hasInterpreters.resolve(true)
    return {
      ...(details as PythonInterpreter),
      path: interpreterPath,
      type: InterpreterType.Poetry,
      poetryWorkspaceFolder: poetryCwd
    }
  }

  private getPoetryWorkingDirectory(resource?: Uri): string | undefined {
    // The file is not in a workspace. However, workspace may be opened
    // and file is just a random file opened from elsewhere. In this case
    // we still want to provide interpreter associated with the workspace.
    // Otherwise if user tries and formats the file, we may end up using
    // plain pip module installer to bring in the formatter and it is wrong.
    const wsFolder = resource ? this.workspace.getWorkspaceFolder(resource) : undefined
    return wsFolder ? Uri.parse(wsFolder.uri).fsPath : this.workspace.rootPath
  }

  private async getInterpreterPathFromPoetry(cwd: string, ignoreErrors = false): Promise<string | undefined> {
    // Quick check before actually running poetry
    if (!(await this.checkIfPoetryLockFileExists(cwd))) {
      return
    }
    try {
      const pythonPath = await this.invokePoetry('env info -p', cwd)
      return pythonPath && (await this.fs.fileExists(pythonPath)) ? pythonPath : undefined
      // tslint:disable-next-line:no-empty
    } catch (error) {
      traceError('Poetry identification failed', error)
      if (ignoreErrors) {
        return
      }
      const errorMessage = error.message || error
      // const appShell = this.serviceContainer.get<IApplicationShell>(IApplicationShell)
      workspace.showMessage(
        `Workspace contains pipfile but attempt to run 'poetry env info -p' failed with ${errorMessage}. Make sure poetry is on the PATH.`, 'warning'
      )
    }
  }
  private async checkIfPoetryLockFileExists(cwd: string): Promise<boolean> {
    if (await this.fs.fileExists(path.join(cwd, 'poetry.lock'))) {
      return true
    }
    return false
  }

  private async invokePoetry(arg: string, rootPath: string): Promise<string | undefined> {
    try {
      const processService = await this.processServiceFactory.create(Uri.file(rootPath))
      const execName = this.executable
      const result = await processService.exec(execName, ['env', 'info', '-p'], { cwd: rootPath })
      if (result) {
        const stdout = result.stdout ? result.stdout.trim() : ''
        const stderr = result.stderr ? result.stderr.trim() : ''
        if (stderr.length > 0 && stdout.length === 0) {
          throw new Error(stderr)
        }
          let pythonPath = path.join(result.stdout.trim(), "bin", "python")
          this.logger.logWarning(pythonPath)
          return pythonPath
      }
      // tslint:disable-next-line:no-empty
    } catch (error) {
      const platformService = this.serviceContainer.get<IPlatformService>(IPlatformService)
      const currentProc = this.serviceContainer.get<ICurrentProcess>(ICurrentProcess)
      const enviromentVariableValues: Record<string, string | undefined> = {
        LC_ALL: currentProc.env.LC_ALL,
        LANG: currentProc.env.LANG
      }
      enviromentVariableValues[platformService.pathVariableName] =
        currentProc.env[platformService.pathVariableName]

      this.logger.logWarning('Error in invoking Poetry', error)
      this.logger.logWarning(
        `Relevant Environment Variables ${JSON.stringify(enviromentVariableValues, undefined, 4)}`
      )
      const errorMessage = error.message || error
      // const appShell = this.serviceContainer.get<IApplicationShell>(IApplicationShell)
      workspace.showMessage(
        `Workspace contains pipfile but attempt to run 'poetry env info -p' failed with '${errorMessage}'. Make sure poetry is on the PATH.`, 'warning'
      )
    }
  }
}
