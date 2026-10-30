# EastSun Console — Home Assistant 加载项

把 EastSun 家居控制台作为 HAOS 加载项运行：房间设备卡片、温湿度来源、摄像头、天气、扫地机地图，直接内嵌在 Home Assistant 侧边栏。

## 安装

1. 在 Home Assistant 中进入 **设置 → 应用 → 安装应用**，点击右上角菜单选择 **仓库**；
2. 添加仓库地址：`https://github.com/tsyf888/eastsun_console_ha`；
3. 在商店中找到 **EastSun Console**，点击安装；
4. 启动加载项后，侧边栏会出现 **EastSun Console** 入口（走 Ingress，无需开放端口）。

## 特点

- 自动使用 Supervisor 注入的令牌连接本机 Home Assistant，**无需手动生成长期令牌**；
- 如果是以加载项侧边栏方式运行，无需配置端口，无需开放端口，也无需二次登录，直接匹配 HA 用户组。
- 直连方式首次打开默认admin/admin，可跳过修改，但每次进入都会强制提示修改，修改后不提示；
- 设置好界面后可设置子账号，登出用子账号登陆，避免管理账号误修改界面；
- 数据保存在加载项 `/data` 目录，随备份一起保存。

## 声明

- 本加载项基于 ethan-z11 修改，仅用于个人使用，不涉及任何商业用途。
- 本加载项不提供任何商业支持，仅提供免费的 Home Assistant 加载项服务。
