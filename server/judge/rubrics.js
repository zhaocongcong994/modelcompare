export const RUBRIC_VERSION = 'zh-text-2026-10-08.1';
const dimension = (id, label, criteria, weight = .25) => ({ id, label, criteria, weight });
const coverage = ['遗漏任务主要要求或答非所问', '覆盖部分要求，关键内容仍缺失', '完整覆盖明确要求，无明显遗漏'];
const clarity = ['表达混乱，难以理解', '能理解但有冗余或结构不清', '表达清楚，组织顺畅'];
const constraints = ['违反明确限制', '基本遵循但有局部偏离', '遵循全部明确限制'];
const grounding = ['作出参考资料不支持的具体承诺或断言', '有未明确标注的不确定细节', '内容与给定资料一致，未知事实明确为待确认，不编造承诺'];
export const RUBRICS = {
  product: [dimension('coverage', '功能覆盖', coverage), dimension('clarity', '表达清晰', clarity), dimension('constraints', '限制遵循', constraints), dimension('grounding', '无依据承诺', grounding)],
  support: [dimension('empathy', '情绪回应', ['忽视用户情绪或责备用户', '礼貌回应但未针对实际困扰', '针对实际困扰真诚回应']), dimension('actionability', '可执行性', ['没有下一步或步骤不可行', '给出方向但步骤不具体', '提出权限范围内具体可执行的下一步']), dimension('constraints', '权限遵循', constraints), dimension('grounding', '处置依据', grounding)],
  marketing: [dimension('coverage', '卖点覆盖', coverage), dimension('audience', '受众适配', ['与目标受众或渠道明显不符', '部分符合受众，仍有明显偏离', '措辞与内容符合给定受众和渠道']), dimension('naturalness', '表达自然', ['语句生硬或反复堆砌套话', '基本自然，局部刻意或重复', '语句自然流畅']), dimension('grounding', '承诺依据', grounding)],
};
export function sceneForPrompt(title) {
  if (/产品.*说明/.test(title)) return 'product';
  if (/客服/.test(title)) return 'support';
  if (/营销/.test(title)) return 'marketing';
  return null;
}
