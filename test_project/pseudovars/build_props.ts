interface PACKAGE_VERSION_MARKER {}
interface MODULE_NAME_MARKER {}

export const packageVersion: string & PACKAGE_VERSION_MARKER = "<will be substituted>"
export const moduleName: string & MODULE_NAME_MARKER = "<will be substituted>"