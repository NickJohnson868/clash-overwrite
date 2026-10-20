---
name: clash-overwrite
description: 维护 Bettbox、Clash Party 等 Mihomo 客户端的 index.js 覆写和 sing-box 自建节点；按实测诊断断连、吞吐、Google Play 分流与 DNS，维护多协议、BBR、连接复用和服务器发布。适用于本目录自建代理与覆写维护，不用于无关业务代码或未经诊断的一键优化。
---

# 自建节点诊断、调优与 Clash 覆写维护

以“服务器外网正常、用户访问慢”为主要场景，先定位瓶颈，再做可回退的对照实验。区分持续下载速度与首次播放、拖动进度条、页面响应，不能只凭延迟或单次测速判断性能。

## 本目录约定

- [index.js](index.js) 是需要维护的 Clash Party 覆写源文件；以实际内容为准，不直接输出整个文件，它包含节点认证信息。
- 自建节点按 `Lisa-地区-协议` 命名，例如 `Lisa-US-Hysteria2`。
- 截至 2026-10-20，Lisa 分组保留 Hysteria2、VLESS、Trojan、VMess、TUIC、AnyTLS 六种自建节点，名称和当前参数见下表。德国节点保持移除；Shadowsocks2022 已按用户要求退役，不要根据历史记录自动重新部署。
- 当前 Hysteria 2 使用 UDP 443、证书 SHA-256 指纹校验、下载目标 `down: "80 Mbps"`，未设置 `up`。这些是本次环境的实测选择，不是其他线路的默认答案。
- 从脚本移除节点不等于停止服务器服务。维护时核对两侧；本次 Shadowsocks2022 已同时删除脚本节点和服务器入站、关闭 TCP/UDP 24401 监听。不要因此批量删除订阅中其他供应商的同类节点。
- 本文是操作知识，不包含服务器密码、节点密码、UUID、私钥或可直接导入的节点链接。凭证只在必要的认证与配置过程中使用，不打印到日志或交付说明。

### 服务器发布方式

日常客户端使用服务器上的远程覆写。本地 `index.js` 是维护源文件，发布文件位于服务器 `/srv/clash-overwrite/<UUID>.js`，由 Nginx 的 TCP 443 提供 HTTPS；它与 Hysteria 2 的 UDP 443 共存。访问地址保存在本地 `server-address.txt`，已通过 Git 本地排除规则排除，不在技能正文或日志中展示。UUID 地址相当于持有链接即可访问，不是独立身份认证。

后续要求更新线上覆写时，保留现有 UUID 地址，先校验本地脚本，再通过 SSH 上传临时文件并原子替换发布文件，核对 HTTPS 下载与本地内容一致。仅修改本地文件不会自动更新服务器。不要把整个仓库、技能文档或凭证副本暴露在 Web 根目录。

Nginx 站点配置为 `/etc/nginx/sites-available/clash-overwrite`；普通首页、`/index.js` 和 HTTP 脚本访问均返回 404，仅 HTTP ACME 验证路径保持可用。HTTPS 使用 Let's Encrypt IP 短期证书，由 `clash-certbot-renew.timer` 每日两次检查续期，成功后通过 `/etc/letsencrypt/renewal-hooks/deploy/reload-nginx` 重载 Nginx。排查远程导入失败时检查证书有效期、续期服务和专用地址，不要关闭客户端 TLS 验证。

## 六协议部署与优化维护（2026-10-20）

实际源文件与服务端配置优先于本节快照。多协议部署提交为 `0d0de76`，Trojan/AnyTLS 优化提交为 `0d83c6e`；随后按用户要求移除了自建 Shadowsocks2022。测试客户端为官方 Mihomo v1.19.32，服务器为 sing-box 1.14.1；升级或更换客户端时重新验证支持的字段。

### 当前协议与端口

| 脚本节点名 | 服务器监听 | 已采用参数 |
| --- | --- | --- |
| `Lisa-US-Hysteria2` | UDP 443 | 客户端 `down: "80 Mbps"`，未设置 `up`；自签证书 SHA-256 指纹固定，`skip-cert-verify: false` |
| `Lisa-US-VLESS` | TCP 8443 | REALITY、`flow: xtls-rprx-vision`、TCP；沿用原服务端与客户端配对参数 |
| `Lisa-US-Trojan` | TCP 24402 | TLS；服务端 `multiplex.enabled: true`、`padding: false`；客户端仅 TCP 启用 h2mux，参数见下文 |
| `Lisa-US-VMess` | TCP 24403 | TLS、`network: tcp`、`alterId: 0`、`cipher: auto`；不启用额外 smux |
| `Lisa-US-TUIC` | UDP 24404 | TUIC v5（UUID + 独立密码）；两端 BBR、10 秒心跳、禁用 0-RTT，参数见下文 |
| `Lisa-US-AnyTLS` | TCP 24405 | TLS、`client-fingerprint: chrome`；空闲检查 30 秒、超时 120 秒、`min-idle-session: 1` |

`LISA_US_ADDITIONAL` 定义新增四节点，`LISA_US_NODES` 汇总六节点；由循环注入 `config.proxies`，Lisa 与自选/服务分组引用同一节点名称集合。保留现有协议名以维持客户端保存的选择。`main` 会精确过滤旧的 `Lisa-US-Shadowsocks2022`，避免缓存输入重新带回退役节点，不按 `type: ss` 过滤整份订阅。

### 服务边界与配置文件

- 原服务 `sing-box.service`：入口 `/etc/sing-box/config.json` 和 `/etc/sing-box/hysteria2.json`，目录合并加载；负责 VLESS 与 Hysteria2。
- 新服务 `sing-box-protocols.service`：只加载 `/etc/sing-box-protocols/config.json`，负责 Trojan、VMess、TUIC、AnyTLS；状态目录 `/var/lib/sing-box-protocols`。已开机自启，`Restart=on-failure`、`RestartSec=5s`、`LimitNOFILE=65536`，`ExecReload` 向主进程发送 HUP。
- 新服务使用 `User=sing-box`，保留 `CAP_DAC_READ_SEARCH`、`CAP_NET_BIND_SERVICE`、`CAP_NET_ADMIN`。`CAP_DAC_READ_SEARCH` 用于读取受保护配置和证书；`CAP_NET_ADMIN` 使 QUIC 库可申请所需 socket 缓冲区。不要在精简权限时无意删掉这些已验证依赖。
- `/etc/sing-box-protocols/client-nodes.json` 是受保护的客户端参数副本，包含认证信息，权限 600；配置目录 700、服务端配置 600。不要将其输出或复制进文档、日志、临时交付物和 Web 目录。更新客户端优化参数时同步该副本。
- 两套服务均沿用直连出口和 IPv4 优先的 Google DoH（服务器地址 `8.8.8.8:443`、TLS 名称 `dns.google`），修改时保留现有 DNS tag 与引用。
- 系统 TCP BBR 已持久化；它适用于 TCP 节点，与 QUIC BBR、Hysteria2 Brutal 不同。TUIC 的 `ss -uanm` 实测 `rb/tb` 各 16777216 字节；仅有 sysctl 上限不能反映实际 socket 缓冲区。

### TLS 证书与续期

Trojan、VMess、TUIC、AnyTLS 使用现有可信 IP 证书：`/etc/letsencrypt/live/<服务器IP>/fullchain.pem` 与 `privkey.pem`。客户端以实际服务器 IP 校验名称，`skip-cert-verify: false`；这四种协议不使用 Hysteria2 自签证书的固定指纹。

`clash-certbot-renew.timer` 沿用原续期机制。除 Nginx 的 `reload-nginx` 外，部署钩子 `/etc/letsencrypt/renewal-hooks/deploy/reload-sing-box-protocols` 在新服务运行时执行配置检查和重载，使进程加载新证书。维护短期证书时同时检查磁盘有效期、客户端实际收到的证书、钩子与服务状态；仅看到证书文件更新不能证明进程已换证。原 Hysteria2 的自签证书和 VLESS REALITY 不依赖这份短期证书。

### 已采用的客户端与服务端优化

Trojan 客户端配置：

```yaml
smux:
  enabled: true
  protocol: h2mux
  max-connections: 4
  min-streams: 4
  only-tcp: true
  padding: false
```

对应 Trojan 服务端入站：`multiplex: {"enabled": true, "padding": false}`。不要同时填写与 `max-connections`、`min-streams` 冲突的 `max-streams`；未启用 TCP Brutal，也没有安装该内核模块。`only-tcp: true` 保留原 UDP 传输方式。服务端验证兼容未开启 smux 的旧 Trojan 客户端，回退时先关闭客户端 smux，再评估是否关闭服务端支持。

AnyTLS 首轮优化保留 `idle-session-check-interval: 30` 和 `idle-session-timeout: 30`，将 `min-idle-session` 从 0 改为 1（后续连接保活调整将 timeout 延长至 120 秒，见下节），用于保留一条空闲会话；没有叠加额外 smux。它改善的是闲置后重用，不是提高带宽上限。

TUIC 服务端：`congestion_control: bbr`、`heartbeat: "10s"`、`zero_rtt_handshake: false`。客户端：`congestion-controller: bbr`、`heartbeat-interval: 10000`（毫秒）、`reduce-rtt: false`、`udp-relay-mode: native`、`alpn: [h3]`。不要把两端参数名和心跳单位混用。

### 连接保活调整（2026-10-20）

- 客户端全局 `keep-alive-idle: 60`、`keep-alive-interval: 30`、`disable-keep-alive: false`，替换原 1800 秒探测间隔。单位为秒。Mihomo 官方说明 Android 强制禁用客户端 TCP keepalive，因此手机上的实际收益不能仅根据这些字段推断；同时设置服务端 TCP 入站保活。
- VLESS、Trojan、VMess、AnyTLS 服务端 TCP 入站增加 `tcp_keep_alive: "60s"`、`tcp_keep_alive_interval: "30s"`。不修改 Hysteria2/TUIC 的 QUIC 心跳、拥塞算法和缓冲区，不修改内核全局 TCP keepalive 默认值。
- AnyTLS 客户端 `idle-session-timeout` 从 30 延长为 120 秒，`idle-session-check-interval: 30`、`min-idle-session: 1` 保留。更长时间保留额外空闲会话，目标是减少短时闲置后的重建；并非提前建立两个会话，也不承诺提高首次连接或下载速度。同步受保护的 `client-nodes.json`。
- 使用临时 AnyTLS 入站对照 Fast Open：关闭三次冷请求 1.109/1.047/1.031 秒，开启三次 0.938/0.937/1.203 秒，但服务器 TCPFastOpenPassive/Active 都是 0，无法证明实际生效，故未采用；实验内核 `tcp_fastopen` 已恢复原值 1，临时监听已删除。
- 物理网卡绑定测试到服务器 TCP RTT 约 203–281 ms，TLS 额外约 219–266 ms；当前参数不改变跨境 BGP 路由。Windows TUN 下普通 socket 的近零 TCP 时间不可当作真实 RTT。
- 本次加载后六协议各完成 3 次 YouTube HTTPS 204 请求（18/18 成功），两套服务与 Nginx 均 active；`ss -ton` 观察到新连接 keepalive 约 30 秒定时器。完整生成配置与旧版本对比，仅预期的保活和 AnyTLS 字段变化，DNS/规则/分组/认证及此前加速参数一致；服务器 HTTPS 下载与本地脚本逐字节一致。旧连接可能仍保留旧 timer，客户端更新应用后检查新连接。
- 保活与延长会话的收益需长期闲置/真实手机使用验证；配置解析和短请求成功不能证明 NAT 存活或根治断线。回退只撤销本节字段并恢复 AnyTLS 30 秒，保留此前 BBR、Trojan h2mux 等设置。

### 对照结果与未采用的实验

- Trojan：同一临时测试端口、20 MB 文件，两轮调换 plain/mux 顺序；plain 下载 32.10/31.70 Mbps，mux 42.31/39.69 Mbps；重复请求中位数约从 1.11/1.01 秒降到 0.65/0.73 秒，因此采用连接复用。
- AnyTLS：一次成对实验，闲置 70 秒后的请求，`min-idle-session: 0` 为 2.343 秒，设为 1 为 0.656 秒；这不是多运营商长期结论。
- Shadowsocks2022 的复用结果波动，未采用，且该协议后来按用户要求退役。VMess 的复用使两轮下载从约 38/36 Mbps 降到 29/31 Mbps，因此保留不复用。
- 为 Hysteria2 人为延迟握手回包 6 秒，默认和 `handshake-timeout: 15` 均在约 5 秒失败；当前测试客户端中未验证该参数有效，未写入正式脚本。不要仅因文档存在该字段就声称修复了间歇断线。
- 短时请求、下载和缓冲区设置均不能证明长期稳定。此前 Hysteria2 间歇断线原因仍未完全确定；不承诺这些优化已根治。不得把一次旧累计 UDP 错误数当作当前丢包率。

### 修改、验收与回退

配置修改前在 `/root/` 留下权限 600 的备份。新配置先写 `.new` 并执行检查，再原子替换；检查/加载失败时恢复本次备份，停止继续叠加参数。旧备份可能仍含已退役的 Shadowsocks2022 入站，回退前必须剔除该入站，不能原样恢复整个历史文件。

```sh
# 原两协议使用目录配置检查；新增四协议使用单文件检查。
sing-box check -C /etc/sing-box
sing-box check -c /etc/sing-box-protocols/config.json
systemctl is-active sing-box sing-box-protocols nginx
systemctl is-enabled sing-box-protocols
sysctl net.ipv4.tcp_congestion_control
ss -uanm '( sport = :24404 )'
ss -lntup '( sport = :24401 )'  # 退役端口应无监听
```

只修改新增四协议时，检查通过后 `systemctl reload sing-box-protocols`；可能中断这四个协议的现有会话，需提前说明。不要顺手重载原 `sing-box`、重启机器或修改客户端的 TUN/Tailscale。退役节点需删除入站、受保护客户端副本、JS 定义与所有分组引用，并验证端口不再监听。

在隔离的测试内核中验证六节点唯一、分组无悬空引用、国内 2009 条规则和 Google Play/NTP/Tailscale 行为仍在；使用实际 Mihomo 校验最终配置。此次部署时验证了 Google、YouTube、下载、代理 UDP 回环和错误证书名称拒绝；修改 TLS 不能以关闭校验来绕过失败。完成后清理临时监听、测试进程及含认证信息的临时配置。

按当前任务授权提交和发布；不要因维护文档而隐含授权改变服务。发布 `index.js` 时保留原 UUID 地址、原子替换，并核对 HTTPS 字节与本地一致；技能文档和客户端副本不得暴露在该站点。Bettbox/手机需要更新远程覆写并重新应用，实际最终配置以客户端为准。

参考：[sing-box Multiplex](https://sing-box.sagernet.org/configuration/shared/multiplex/)、[Mihomo smux 通用字段](https://wiki.metacubex.one/config/proxies/)、[Mihomo AnyTLS](https://wiki.metacubex.one/config/proxies/anytls/)、[Mihomo TUIC](https://wiki.metacubex.one/config/proxies/tuic/)。

## 先收集能够改变判断的信息

确认用户当前的运营商、设备、客户端内核、上下行带宽，以及慢的是视频吞吐还是开始播放。套餐千兆/百兆通常只说明下载侧，不能据此推断上传速度。最好取得 YouTube“详细统计信息”的连接速度、缓冲健康度，并用相同视频和画质比较。

只读取与节点有关的状态，按需检查：

| 层次 | 检查内容 | 如何判断 |
| --- | --- | --- |
| 服务器资源 | CPU 空闲、虚拟机 steal、内存、节点进程占用 | CPU 或内存不足才考虑资源优化 |
| 服务器外网 | 服务器直接下载两个不同来源的 HTTPS 文件 | 下载正常不能证明所有出口、回程或视频 CDN 都正常 |
| 用户到服务器 | 按客户端来源与拥塞算法汇总 RTT、重传、发送窗口 | 低延迟仍可能伴随严重重传和低吞吐 |
| 节点完整链路 | 通过指定代理下载，并核对出口 IP | 防止测速走了直连或其他节点 |
| UDP/QUIC | socket 缓冲区、UDP 缓冲区错误、客户端及服务器资源 | 只有上限较小不代表已经形成瓶颈 |

常用只读命令：

```sh
uptime
free -m
vmstat 1 4
sysctl net.ipv4.tcp_congestion_control net.core.default_qdisc
sysctl net.core.rmem_max net.core.wmem_max
nstat -az UdpRcvbufErrors UdpSndbufErrors
ss -tinH state established '( sport = :8443 )'
ss -uanm '( sport = :443 )'
tc -s qdisc show dev ens17
```

网卡名和端口必须先从实际环境确认。处理 `ss` 输出时，用匿名来源标签代替完整客户端地址；同一来源可能有多个设备或连接，不要只凭 RTT 就认定运营商。日志只输出脱敏后的错误类别与数量。

`bytes_retrans / bytes_sent` 是该连接累计重传字节占比，不是链路丢包率。连接关闭会让快照中的累计值减少；不同快照总量不能直接相减当作精确吞吐。流量稀少时的高比例也需结合字节量判断。

## TCP BBR：先临时验证，再按请求持久化

适用于 TCP 节点存在高重传、窗口收缩，而服务器资源与外网下载正常的情况。先记录原值和已有配置，再临时启用：

```sh
modprobe tcp_bbr
sysctl -w net.ipv4.tcp_congestion_control=bbr
```

用 `ss -ti` 确认新连接实际使用 BBR。原连接可能仍使用 CUBIC；让测试客户端重连，避免把新旧连接混在一起。不要仅凭 sysctl 显示 BBR 就宣布所有流量已切换。

确认效果并且任务包含持久化时，再检查配置文件优先级和已有内容，写入：

```text
# /etc/modules-load.d/bbr.conf
tcp_bbr

# /etc/sysctl.d/99-zz-bbr.conf
net.ipv4.tcp_congestion_control = bbr
```

分别保存到对应文件；不要把示例整块写进同一个文件。用 `sysctl -p /etc/sysctl.d/99-zz-bbr.conf` 验证加载，确认开机模块加载先于 sysctl。未实际重启时，报告“配置加载验证通过”，不声称完成重启验收。

本次保留了 `fq_codel`；不要顺手更换 qdisc、内核或安装所谓 BBR 加速包。回退使用此前记录的原值，并仅恢复本次修改的持久化内容。

## Hysteria 2：复用现有服务，保证证书验证

新增节点时，先确认 sing-box 版本、配置目录、运行用户、端口占用、主机防火墙与服务管理方式。用户要求新增节点才进行部署；阅读本技能本身不授权新增服务、开放端口或重载。

本次使用已有 sing-box 的配置目录合并能力，把独立入站写入 `/etc/sing-box/hysteria2.json`，证书存放在 `/etc/sing-box/hysteria2-tls/`。沿用实际部署结构，不假定所有机器都有相同路径或合并语义。

- 使用独立生成的强密码，不复用 SSH root 密码。
- 无可用域名证书时，可使用自签叶子证书配合客户端证书指纹固定；证书与私钥应由服务账户可读，私钥不离开服务器。
- Mihomo 的 `fingerprint` 是完整证书的 SHA-256 指纹，不是 `client-fingerprint: chrome`。保留 `skip-cert-verify: false`，并实测证书指纹不匹配时连接失败。
- 证书续期或替换后，需要同步更新客户端固定指纹；这是维护事项，不自动创建定时任务。
- 先运行 `sing-box check -C <实际配置目录>`，通过后按该服务支持的方式加载；提前说明可能发生短暂重连，并准备恢复原配置。
- 检查服务状态、UDP 监听以及原节点是否仍可使用。只有监听成功不等于公网 UDP 可达，需要真实客户端连接验证。

内核 TCP BBR 与 Hysteria 2 的 QUIC 拥塞控制是两套机制。不能因为 `net.ipv4.tcp_congestion_control=bbr` 就判断 Hysteria 2 使用何种算法。

## Hysteria 2 带宽调优

先核对当前 sing-box 与 Mihomo 官方文档及版本行为。在本次配置中，客户端未填写 `up/down` 且服务器未强制其他策略时使用自适应拥塞控制；设置下载 `down` 可对下载方向测试 Brutal，上传未设置则继续自适应。

Brutal 的数字是目标带宽，不会凭空增加可用容量。它可能增加发送压力、延迟和对其他流量的影响，因此不能简单填套餐最大值，更不能把两端接入带宽当作跨网链路容量。

建议的实验方式：

1. 保留当前节点参数作为基线，用临时独立客户端建立仅走待测节点的链路，不切换用户正在使用的全局代理。
2. 测试文件大小、下载来源、客户端和网络保持一致；设置超时，将文件输出到空设备，避免占磁盘。
3. 一次只改变下载目标；上传能力不明时不要猜测 `up`。
4. 初次看到改善后调换测试顺序复测，减少时段波动与缓存影响。结合用户相同视频的体验判断，不只比较一个速度数字。
5. 有稳定收益才更新实际覆写；没有收益则保留基线。吞吐增加但缓冲、交互或其他设备明显变差时回退并降低目标。

单位换算：`Mbps = curl 的 speed_download（字节/秒）× 8 / 1,000,000`。完整下载平均速度包含握手和启动阶段；短文件结果不能直接等同于稳定带宽。

本次选择 80 Mbps 来自联通端对照实验与用户后续体验，不代表电信百兆或联通千兆应固定使用 80 Mbps。不同运营商的最优值可能不同；如需分开调优，可在用户要求时提供独立配置选项。

## 修改 index.js 的完整范围

新增、删除、重命名节点时，检查四处：节点常量、注入 `config.proxies` 的逻辑、`proxyNames` 列表、Lisa 及其他分组引用。检查同节点专属 IP 直连规则是否仍需要；共享同一服务器 IP 的其他协议仍在用时，应保留该 IP 规则。

保留现有用户修改、其他节点、业务分流规则和参数。节点删除仅针对用户指定对象，不应顺带过滤订阅中的全部 VLESS。脚本名称变化后，客户端保存的旧选择可能需要重新选择。

验证方式：

- `node --check index.js` 检查语法。
- 使用 Node `vm` 在隔离上下文执行 `main`，传入最小样例配置；断言目标节点存在且不重复、分组引用可解析、无关配置保持不变。每次用新的上下文，避免脚本顶层状态累计干扰结果。
- 用实际安装的 Mihomo 内核检查临时生成配置，并通过独立本地代理端口进行联网验证；Windows 后台测试进程不弹出可见窗口。
- 测完终止测试进程，删除本次产生的含凭证临时配置与副本；不提交凭证、不自动提交或推送 Git。
- 修改本地文件不代表 Clash Party 已重载。交付时明确需要重新加载覆写、必要时重连节点。

## 本次实测记录：用于参考，不作为保证

2026-09-26，同一服务器、Clash Party/Mihomo 客户端：

| 实验 | 观察 |
| --- | --- |
| 服务器直接下载 | Cloudflare 约 250 Mbps，Google 文件约 273 Mbps；未证明所有视频 CDN 状态 |
| 切换 TCP BBR 前 | 电信播放期间的另一路连接累计重传字节占比约 11%～13%；该来源未独立核验运营商 |
| 临时切换 TCP BBR 后 | 新 BBR 连接占比约 0.04%～0.75%，旧 CUBIC 连接仍约 9%～10%；用户确认明显变快。两组并非严格同流对照 |
| Hysteria 2 初始测试 | 联通下载约 45 Mbps；用户表示播放速度相近、响应更快，未抓包验证具体原因 |
| 同一 50 MB 文件对比 | 自适应 BBR 两次约 38、47 Mbps；Brutal 下载目标 80 Mbps 两次约 63、65 Mbps；目标 50 Mbps 单次约 43 Mbps |
| 最终反馈 | 用户表示速度提高非常多；未取得单独、标准化的电信吞吐复测数据 |

本次没有调整 UDP 缓冲区：上限为 212992 字节，但观测到的 `UdpRcvbufErrors`、`UdpSndbufErrors` 均为 0。以后若发现缓冲区错误增长或明确窗口瓶颈，再根据证据与官方建议做独立实验。

## Google Play：规则模式不能下载、全局模式正常

2026-10-19，Bettbox 使用本目录覆写时，Google Play 无法下载应用，切到全局则正常，其他应用仍可使用。修复已发布为 `e86730a`，用户在手机上确认规则模式可以下载。

### 已确认的问题与结论边界

- 此前新增的 `DOMAIN-SUFFIX,cn,直连` 位于 Google 服务规则之前；`services.googleapis.cn`、`android.googleapis.cn` 因而可能先命中直连。即使 Play 页面或部分下载连接显示代理，也不能证明 API、账号与所有 CDN 请求走了相同策略。
- 原脚本主要依赖后面的 `GEOSITE,google,谷歌服务`，没有针对 Play 的高优先级例外；此前 33 个国内和 12 个海外域名的抽查未覆盖这些 `.cn` 依赖。以后新增国内后缀规则，要同时检查海外服务使用的中国域名例外。
- 原脚本继承订阅 DNS，没有为 Play 的解析明确指定同一代理出口。检查到的本机订阅含国内 DNS 和传统 UDP fallback；这不等于已证明手机实际发生 DNS 污染，也不能把原始订阅文件当作运行时配置。
- 本次同时调整了规则优先级和专用 DNS，随后用户实测恢复。确认的是这组改动在该环境有效，未做单变量回退，不能断言只有 DNS 或只有 `.cn` 规则是唯一原因，也未证明 IPv6、QUIC 或节点故障。

### 本次修复方式

1. 使用 `GOOGLE_PLAY_HOSTS`、`GOOGLE_PLAY_SUFFIXES` 与 `getGooglePlayRules()` 生成 Play 例外，在 `config.rules` 中放到国内域名、国内 IP 和兜底规则之前，统一指向 `谷歌服务`。域名以 Google 官方网络要求和实际连接为依据，不靠宽泛的 `google`、`play` 关键词。
2. 显式覆盖 `play.google.com`、`dl.google.com`、`dl-ssl.google.com`、Android/Play API、账号认证，以及 `gvt1.com`、`gvt2.com`、`gvt3.com`、`googleusercontent.com`、`ggpht.com`、`xn--ngstr-lra8j.com` 等下载资源；特别保留 `services.googleapis.cn`、`android.googleapis.cn` 的优先代理例外。完整名单维护在 `index.js`，此处不重复抄录。
3. `configureGooglePlayDns(config)` 仅在 Google 分流开启且 `config.dns.enable` 为真时，为上述域名合并 `nameserver-policy`，使用 `https://8.8.8.8/dns-query#谷歌服务` 和 `https://1.1.1.1/dns-query#谷歌服务`。含 `#谷歌服务` 的 DNS URL 必须作为完整字符串保存。
4. 保留原 DNS 其他设置与无关域名策略。已配置的 `proxy-server-nameserver` 不覆盖；缺少时补 `223.5.5.5`、`119.29.29.29` 用于节点域名引导解析，避免通过尚未解析成功的代理查询代理自身。不要因为本例全局关闭 IPv6、屏蔽 UDP 443 或更换所有应用 DNS。
5. 客户端将 `谷歌服务` 选择为全局模式下可下载的同一个节点；更新覆写并重新应用、重连，取消旧下载后重新发起。脚本发布成功与手机实际应用成功分别验证。

### 排查与验收

- 以失败时实际连接的主机、匹配规则、完整策略链和最终节点为准，分别检查 Play 页面、登录、API、下载请求；代码中写代理不等于运行时所有依赖都走代理。
- 用新的 Node `vm` 上下文执行 `main`，验证 `.cn` Play 主机命中 `谷歌服务` 的规则排在 `.cn` 直连前；合并 DNS 策略时无关项仍在、关闭 DNS 的输入保持关闭、关闭 Google 分流不产生悬空策略引用。
- 验证国内应用直连、YouTube、NTP 和已有节点仍保留。运行 `node --check` 与实际 Mihomo 配置校验；仅做规则/DNS 子集校验时明确其范围，不称为完整配置联网验收。
- 需要发布时沿用现有 UUID 地址，备份旧文件、原子替换，再核对 HTTPS 内容与本地一致。最终以手机在规则模式下实际完成下载为验收依据。

参考：[Google Android Enterprise 网络要求](https://support.google.com/work/android/answer/10513641?hl=en)、[Mihomo DNS 与 nameserver-policy](https://wiki.metacubex.one/config/dns/)、[上游 Google Play 域名清单](https://github.com/v2fly/domain-list-community/blob/master/data/google-play)。

## 官方参考

只在涉及对应配置或版本差异时读取，避免把其他实现的字段直接复制到 sing-box/Mihomo：

- [sing-box Hysteria 2 入站](https://sing-box.sagernet.org/configuration/inbound/hysteria2/)
- [Mihomo Hysteria 2 出站](https://wiki.metacubex.one/config/proxies/hysteria2/)
- [Mihomo TLS 与证书指纹](https://wiki.metacubex.one/config/proxies/tls/)
- [Hysteria 性能调优](https://v2.hysteria.network/docs/advanced/Performance/)
- [Hysteria 客户端带宽与拥塞控制](https://v2.hysteria.network/docs/advanced/Full-Client-Config/)

交付时说明具体改动、实测条件与结果、是否持久化/重载，以及尚未验证的网络。不要把响应变快归因于某一机制，除非有足够数据支撑。
