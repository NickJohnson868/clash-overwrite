/**
 * 分流规则配置，会自动生成对应的策略组
 * 设置的时候可遵循"最小，可用"原则，把自己不需要的规则全禁用掉，提高效率
 * true = 启用，false = 禁用
 */

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

const ruleOptions = {
  domestic: true,
  foreign: true,
  microsoft: true,
  openai: true,
  ads: true,
  youtube: true,
  google: true,
};

const BOOTSNET = {
  name: "BootsNet",
  type: "socks5",
  server: "127.0.0.1",
  port: 7999,
  udp: true,
};

const BOOTSNET_PROCESS_RULES = [
  "PROCESS-NAME,BootsNet.exe,DIRECT",
  "PROCESS-NAME,bootsnet.exe,DIRECT",
];

const ruleProviderDefaults = {
  type: "http",
  format: "yaml",
  interval: 86400,
};

const proxyGroupDefaults = {
  interval: 300,
  timeout: 3000,
  url: "http://www.gstatic.com/generate_204",
  lazy: true,
  "max-failed-times": 3,
  hidden: false,
};

const ruleProviders = new Map();
const rules = [];
let proxyNames = [];

const uniq = (arr) => [...new Set(arr.filter(Boolean))];

const getRawProxyNames = () =>
  proxyNames.filter((name) => name !== BOOTSNET.name && name !== "直连");

const getSelfSelectProxies = () =>
  uniq(["直连", BOOTSNET.name, ...getRawProxyNames()]);

const getDefaultProxies = () =>
  uniq(["自选节点", "直连", BOOTSNET.name, ...getRawProxyNames()]);

const getDomesticProxies = () =>
  uniq(["直连", BOOTSNET.name, "自选节点", ...getRawProxyNames()]);

const SERVICE_DEFINITIONS = [
  {
    key: "openai",
    rules: ["DOMAIN-SUFFIX,chatgpt.com,国外AI", "RULE-SET,ai,国外AI"],
    name: "国外AI",
    icon: "https://fastly.jsdelivr.net/gh/Koolson/Qure/IconSet/Color/ChatGPT.png",
    url: "https://chatgpt.com/cdn-cgi/trace",
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
    url: "http://www.gstatic.com/generate_204",
  },
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

function initBaseConfig(config) {
  rules.push(
    ...BOOTSNET_PROCESS_RULES,
    "GEOSITE,private,DIRECT",
    "GEOIP,private,DIRECT,no-resolve"
  );

  proxyNames = (config.proxies || []).map((p) => p.name).filter(Boolean);

  Object.assign(config, {
    "allow-lan": true,
    "bind-address": "*",
    mode: "rule",
    profile: {
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

function registerServices(config) {
  for (const svc of SERVICE_DEFINITIONS) {
    if (!ruleOptions[svc.key]) continue;

    if (Array.isArray(svc.rules)) {
      rules.push(...svc.rules);
    } else {
      rules.push(svc.rules);
    }

    if (svc.ruleProvider) {
      ruleProviders.set(svc.ruleProvider.key, {
        ...ruleProviderDefaults,
        ...svc.ruleProvider.config,
      });
    }

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

  initBaseConfig(config);

  if (!config.proxies.some((p) => p.name === "直连")) {
    config.proxies.push({
      name: "直连",
      type: "direct",
      udp: true,
    });
  }

  if (!config.proxies.some((p) => p.name === BOOTSNET.name)) {
    config.proxies.push(BOOTSNET);
  }

  proxyNames = uniq([...proxyNames, BOOTSNET.name]);

  config["proxy-groups"] = [
    {
      ...proxyGroupDefaults,
      name: "自选节点",
      type: "select",
      proxies: getSelfSelectProxies(),
      icon: "https://fastly.jsdelivr.net/gh/Koolson/Qure/IconSet/Color/Proxy.png",
    },
  ];

  rules.push(...customDomainRules);

  registerServices(config);

  config.rules = rules;
  config["rule-providers"] = Object.fromEntries(ruleProviders);

  return config;
};