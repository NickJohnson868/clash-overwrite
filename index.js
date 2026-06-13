/**
 * 分流规则配置，会自动生成对应的策略组
 * 设置的时候可遵循"最小，可用"原则，把自己不需要的规则全禁用掉，提高效率
 * true = 启用，false = 禁用
 */

// ═══════════════════════════════════════════════════════════
// 1. 用户配置区
// ═══════════════════════════════════════════════════════════

/** 自定义域名分流规则 */
const customDomainRules = [
  "DOMAIN-SUFFIX,hyperos.fans,直连",
  "DOMAIN-SUFFIX,gitcode.com,直连",
  "DOMAIN-SUFFIX,ybm100.com,直连",
  "DOMAIN-SUFFIX,xiaosn.com,直连",
  "DOMAIN-SUFFIX,juhefu.com,直连",
  "DOMAIN-SUFFIX,yaolinks.com,直连",
  "DOMAIN-SUFFIX,bigmodel.cn,直连",
  "DOMAIN-SUFFIX,hutaocards.com,直连",
  "DOMAIN-SUFFIX,publicvm.com,直连",
  "DOMAIN-SUFFIX,worldquantbrain.com,直连",
  "DOMAIN-SUFFIX,biglongxia.com,直连",
  "DOMAIN-SUFFIX,song868.ccwu.cc,直连",
  "DOMAIN-SUFFIX,92ydl.com,直连",
  "DOMAIN-SUFFIX,ipzan.com,直连",
  "DOMAIN-SUFFIX,nip.cmliusss,直连",

  "DOMAIN-SUFFIX,supercell.com,自选节点",
  "DOMAIN-SUFFIX,grok.com,国外AI",

  "DOMAIN-KEYWORD,gemini,国外AI",
  "DOMAIN-KEYWORD,openai,国外AI",

  "IP-CIDR,8.148.247.44/32,直连,no-resolve",
];

/** 功能开关 */
const ruleOptions = {
  domestic: true,   // 国内策略组
  foreign: true,    // 国外策略组
  microsoft: true,  // 微软服务
  openai: true,     // 国外AI和GPT
  baiduAi: false,   // 百度AI
  ads: true,        // 常见的网络广告
  youtube: true,    // YouTube 视频
  google: true,     // Google服务
};

/** BootsNet 本地代理配置 */
const BOOTSNET = {
  name: "BootsNet",
  type: "socks5", // 如果 7999 是 HTTP 代理，改成 "http"
  server: "127.0.0.1",
  port: 7999,
  udp: true,
};

/** BootsNet 进程名，防止代理循环 */
const BOOTSNET_PROCESS_RULES = [
  "PROCESS-NAME,BootsNet.exe,DIRECT",
  "PROCESS-NAME,bootsnet.exe,DIRECT",
];

// ═══════════════════════════════════════════════════════════
// 2. 通用默认配置
// ═══════════════════════════════════════════════════════════

/** 规则集通用默认值 */
const ruleProviderDefaults = {
  type: "http",
  format: "yaml",
  interval: 86400,
};

/** 代理组通用默认值 */
const proxyGroupDefaults = {
  interval: 300,
  timeout: 3000,
  url: "http://www.gstatic.com/generate_204",
  lazy: true,
  "max-failed-times": 3,
  hidden: false,
};

// ═══════════════════════════════════════════════════════════
// 3. 内部状态
// ═══════════════════════════════════════════════════════════

const ruleProviders = new Map();
const rules = [];
let proxyNames = [];

const uniq = (arr) => [...new Set(arr.filter(Boolean))];

const getRawProxyNames = () =>
  proxyNames.filter((name) => name !== BOOTSNET.name && name !== "直连");

const getSelfSelectProxies = () =>
  uniq(["直连", BOOTSNET.name, ...getRawProxyNames()]);

// ✅ 改动点：自选节点排首位，BootsNet 移到直连之后
const getDefaultProxies = () =>
  uniq(["自选节点", "直连", BOOTSNET.name, ...getRawProxyNames()]);

const getDomesticProxies = () =>
  uniq(["直连", BOOTSNET.name, "自选节点", ...getRawProxyNames()]);

// ═══════════════════════════════════════════════════════════
// 4. 服务定义表（按规则优先级排列）
// ═══════════════════════════════════════════════════════════

/**
 * 每个条目定义一个可选服务：
 *   key          — ruleOptions 中对应的开关字段
 *   rules        — 分流规则，单个字符串或字符串数组
 *   name         — 代理组名称
 *   icon         — 图标 URL
 *   url          — [可选] 连通性测试 URL，不填则使用默认值
 *   proxies      — [可选] 自定义代理列表（数组或返回数组的函数），不填则使用默认列表
 *   ruleProvider — [可选] 需要额外注册的规则集 { key, config }
 */
const SERVICE_DEFINITIONS = [
  // ── AI ─────────────────────────────────────────────────
  {
    key: "openai",
    rules: ["DOMAIN-SUFFIX,chatgpt.com,国外AI", "RULE-SET,ai,国外AI"],
    name: "国外AI",
    icon: "https://fastly.jsdelivr.net/gh/Koolson/Qure/IconSet/Color/ChatGPT.png",
    url: "https://chat.openai.com/cdn-cgi/trace",
    ruleProvider: {
      key: "ai",
      config: {
        behavior: "domain",
        format: "mrs",
        url: "https://fastly.jsdelivr.net/gh/DustinWin/ruleset_geodata@clash-ruleset/ai.mrs",
        path: "./ruleset/DustinWin/ai.mrs",
      },
    },
  },
  {
    key: "baiduAi",
    rules: [
      "DOMAIN,chat.baidu.com,百度AI",
      "DOMAIN-SUFFIX,chat.baidu.com,百度AI",
      "DOMAIN,315jiage.cn,百度AI",
      "DOMAIN-SUFFIX,315jiage.cn,百度AI",
    ],
    name: "百度AI",
    icon: "https://psstatic.cdn.bcebos.com/aife/static/private-active-img_1772711716000.png",
    url: "https://chat.baidu.com",
  },

  // ── 平台服务 ───────────────────────────────────────────
  {
    key: "youtube",
    rules: [
      "GEOSITE,youtube,YouTube",
      "DOMAIN-SUFFIX,youtube.com,YouTube",
      "DOMAIN-SUFFIX,youtu.be,YouTube",
      "DOMAIN-SUFFIX,googlevideo.com,YouTube",
      "DOMAIN-SUFFIX,ytimg.com,YouTube",
      "DOMAIN,youtubei.googleapis.com,YouTube",
      "DOMAIN,youtube.googleapis.com,YouTube",
    ],
    name: "YouTube",
    icon: "https://fastly.jsdelivr.net/gh/Koolson/Qure/IconSet/Color/YouTube.png",
    url: "https://www.youtube.com/generate_204",
  },
  {
    key: "google",
    rules: "GEOSITE,google,谷歌服务",
    name: "谷歌服务",
    icon: "https://fastly.jsdelivr.net/gh/Koolson/Qure/IconSet/Color/Google_Search.png",
    url: "https://www.google.com/generate_204",
  },
  {
    key: "microsoft",
    rules: ["GEOSITE,microsoft@cn,国内网站", "GEOSITE,microsoft,微软服务"],
    name: "微软服务",
    icon: "https://fastly.jsdelivr.net/gh/Koolson/Qure/IconSet/Color/Microsoft.png",
    url: "https://www.msftconnecttest.com/connecttest.txt",
  },

  // ── 国内 / 外网 / 广告 ──────────────────────────────
  {
    key: "domestic",
    rules: ["GEOIP,CN,国内网站,no-resolve", "GEOSITE,CN,国内网站"],
    name: "国内网站",
    icon: "https://fastly.jsdelivr.net/gh/Koolson/Qure/IconSet/Color/StreamingCN.png",
    url: "https://wifi.vivo.com.cn/generate_204",
    proxies: getDomesticProxies,
  },
  {
    key: "foreign",
    rules: "MATCH,其他外网",
    name: "其他外网",
    icon: "https://fastly.jsdelivr.net/gh/Koolson/Qure/IconSet/Color/Streaming!CN.png",
  },
  {
    key: "ads",
    rules: "GEOSITE,category-ads-all,广告过滤",
    name: "广告过滤",
    icon: "https://fastly.jsdelivr.net/gh/Koolson/Qure/IconSet/Color/Advertising.png",
    proxies: ["REJECT", "直连", "自选节点", BOOTSNET.name],
  },
];

// ═══════════════════════════════════════════════════════════
// 5. 核心函数
// ═══════════════════════════════════════════════════════════

/** 初始化基础配置和内置规则集 */
function initBaseConfig(config) {
  rules.push(
    ...BOOTSNET_PROCESS_RULES,

    // 局域网 / 私有地址直连
    "GEOSITE,private,DIRECT",
    "GEOIP,private,DIRECT,no-resolve"
  );

  proxyNames = (config.proxies || []).map((p) => p.name).filter(Boolean);

  Object.assign(config, {
    "allow-lan": true,
    "bind-address": "*",
    "mode": "rule",
    "profile": {
      "store-selected": true,
      "store-fake-ip": true,
    },
    "unified-delay": true,
    "tcp-concurrent": true,
    "keep-alive-interval": 1800,
    "find-process-mode": "strict",
    "geodata-mode": true,
    "geodata-loader": "standard",
    "geo-auto-update": true,
    "geo-update-interval": 24,
  });
}

/** 根据 ruleOptions 注册启用的服务（规则 + 代理组） */
function registerServices(config) {
  for (const svc of SERVICE_DEFINITIONS) {
    if (!ruleOptions[svc.key]) continue;

    // 添加分流规则
    if (Array.isArray(svc.rules)) {
      rules.push(...svc.rules);
    } else {
      rules.push(svc.rules);
    }

    // 注册规则集
    if (svc.ruleProvider) {
      ruleProviders.set(svc.ruleProvider.key, {
        ...ruleProviderDefaults,
        ...svc.ruleProvider.config,
      });
    }

    // 添加代理组
    const proxies =
      typeof svc.proxies === "function"
        ? svc.proxies()
        : svc.proxies || getDefaultProxies();

    config["proxy-groups"].push({
      ...proxyGroupDefaults,
      name: svc.name,
      type: "select",
      proxies,
      ...(svc.url && { url: svc.url }),
      ...(svc.icon && { icon: svc.icon }),
    });
  }
}

/** 程序入口 */
const main = (config, profileName) => {
  const proxyCount = config?.proxies?.length ?? 0;
  const proxyProviderCount =
    typeof config?.["proxy-providers"] === "object"
      ? Object.keys(config["proxy-providers"]).length
      : 0;

  if (proxyCount === 0 && proxyProviderCount === 0) {
    throw new Error("配置文件中未找到任何代理");
  }

  config.proxies = config.proxies || [];

  // 1. 初始化基础配置
  initBaseConfig(config);

  // 2. 添加直连节点
  if (!config.proxies.some((p) => p.name === "直连")) {
    config.proxies.push({
      name: "直连",
      type: "direct",
      udp: true,
    });
  }

  // 3. 添加 BootsNet 本地代理节点
  if (!config.proxies.some((p) => p.name === BOOTSNET.name)) {
    config.proxies.push(BOOTSNET);
  }

  // 4. 刷新代理名称，确保 BootsNet 出现在策略组里
  proxyNames = uniq([...proxyNames, BOOTSNET.name]);

  // 5. 创建默认代理组
  config["proxy-groups"] = [
    {
      ...proxyGroupDefaults,
      name: "自选节点",
      type: "select",
      proxies: getSelfSelectProxies(),
      icon: "https://fastly.jsdelivr.net/gh/Koolson/Qure/IconSet/Color/Proxy.png",
    },
  ];

  // 6. 添加自定义域名规则
  rules.push(...customDomainRules);

  // 7. 注册可选服务
  registerServices(config);

  // 8. 覆盖原配置中的规则
  config["rules"] = rules;
  config["rule-providers"] = Object.fromEntries(ruleProviders);

  return config;
};