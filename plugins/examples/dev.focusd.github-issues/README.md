# GitHub Issues

在岛上列出一个或多个 GitHub 仓库里还没关闭的 issue，每个仓库一组。

## 怎么用

- 在插件设置里填写仓库，格式是 `owner/name`，多个用逗号分隔，例如 `TixXin/fly-island, owner/other`，最多 20 个。
- 岛上会多一个页面，每个仓库一组，组名是 `owner/name - N open`，点一条就在浏览器里打开。
- 某个仓库出错（名字写错、找不到、次数用完）只影响那一组，其他仓库照常显示。
- 运行命令「立即刷新」可以马上更新；平时按设置里的间隔刷新，只在页面打开时才去请求。

## 请求次数

页面最上面一行显示现在是匿名还是已登录，以及这个小时还剩多少次请求。

- 不登录时，GitHub 每小时只给 60 次，而且按网络出口计算（走代理或公司网络时可能和别人共用）。每个仓库每次刷新用 1 次，所以仓库多时插件会自动拉长刷新间隔，保证每小时不超过 50 次：例如 20 个仓库至少 24 分钟刷新一次。
- 次数用完时，各组会显示什么时候重置，到时再试。

## 用 GitHub 账号登录（可选，默认关闭）

1. 在插件设置里打开「用 GitHub 账号登录」。
2. 在插件页面点「登录 GitHub」（或运行命令「登录 GitHub」）。第一次会询问是否允许「密钥」权限，令牌要存进 Windows 凭据管理器。
3. 页面显示一个验证码（已复制到剪贴板），点它打开 github.com/login/device，粘贴验证码并授权。授权后页面自动更新。

登录后每小时 5000 次请求。插件只申请读取 issue 和仓库基本信息，不能修改任何东西。

- **私有仓库**：登录只能看到装了这个 GitHub App 的仓库。要看私有仓库，先把 App 安装到对应的账号或组织上。
- **退出**：点「退出登录」，或关掉设置里的开关，令牌会从凭据管理器删除，改回匿名访问。
- 令牌失效或过期时，插件自动改回匿名访问，并提示重新登录。
- 插件不会读取本机 `gh` 命令行的令牌：它通常带仓库的写权限，一个只看 issue 的插件不该拿来用。

## 设置

- **仓库**：要查看的仓库，多个用逗号分隔。
- **刷新间隔（分钟）**：仓库多时会自动拉长。
- **用 GitHub 账号登录**：默认关闭。
- **GitHub App Client ID**：留空即可；想用自己注册的 GitHub App 登录时才填。

## English

Lists the open issues of one or more GitHub repositories on an island page, one group per repository; click one to open it in the browser. Set the repositories (`owner/name`, comma separated, up to 20) in the plugin's settings. Without signing in GitHub allows 60 calls an hour, so the refresh interval grows with the number of repositories; the top row shows the calls left. Signing in with GitHub (off by default) uses a code you confirm in the browser, raises the limit to 5000 an hour, asks only for issue read access, and keeps the token in the Windows Credential Manager. Private repositories need the GitHub App installed on their account or organization.
