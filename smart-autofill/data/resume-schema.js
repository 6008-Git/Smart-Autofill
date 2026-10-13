(() => {
  "use strict";
  const saf = globalThis.SmartAutofill;
  // Field definitions only. Personal values must come from a user's explicit JSON import.
  const text = (label, extra = {}) => ({ type: "text", label, source: label, ...extra });
  const long = (label, extra = {}) => text(label, { multiline: true, ...extra });
  const list = (label, extra = {}) => ({ type: "list", label, source: label, ...extra });
  const object = (label, properties, extra = {}) => ({ type: "object", label, properties, source: label, ...extra });
  const records = (label, properties, extra = {}) => ({ type: "records", label, item: object(label, properties), source: label, ...extra });
  const sources = () => list("数据来源 / 导入说明", { source: "数据来源", fillable: false, keywords: ["数据来源", "data sources"] });
  const legacy = (key, extra = {}) => {
    const rule = saf.FIELD_RULES.find(field => field.key === key);
    return text(rule.label, { source: null, legacyKey: key, keywords: rule.keywords, autocomplete: rule.autocomplete, types: rule.types, ...extra });
  };
  saf.PROFILE_SCHEMA = object("个人资料", {
    basic: object("基本信息", {
      name: legacy("name", { source: "姓名" }), gender: legacy("gender", { source: "性别" }),
      ethnicity: legacy("ethnicity", { source: "民族" }), birthday: legacy("birthday", { source: "出生日期" }),
      phone: legacy("phone", { source: "联系电话" }), email: legacy("email", { source: "邮箱" }),
      idCard: legacy("idCard", { source: "证件号码" }), age: text("年龄"),
      politicalStatus: text("政治面貌"), maritalStatus: text("婚姻状况"), height: text("身高"), weight: text("体重"),
      healthStatus: text("健康状况"), specialTalents: long("特长"), yearsOfExperience: text("工作年限"),
      wechatId: text("微信号"), qqNumber: text("QQ"), documentType: text("证件类型"),
      englishProficiency: text("英语水平"), graduationCohort: text("毕业届别"), idPhoto: text("证件照"),
      emergencyContact: object("紧急联系人", {
        name: text("姓名", { keywords: ["紧急联系人姓名", "emergency contact name"] }),
        phone: text("电话", { keywords: ["紧急联系人电话", "emergency contact phone"] })
      }), dataSources: sources()
    }, { source: null, sourceFile: "基本信息.json", note: "身份、联系方式与紧急联系人" }),
    education: object("常用教育信息", Object.fromEntries(["school", "college", "major", "educationLevel", "degree", "enrollmentDate", "graduationDate"].map(key => [key, legacy(key)])),
      { source: null, note: "空白字段读取最近开始的一条教育经历，来源显示在字段下方；也可单独编辑覆盖" }),
    location: object("地址信息", {
      hometown: legacy("hometown", { source: "籍贯" }), province: legacy("province"), city: legacy("city"),
      address: legacy("address", { source: "通信地址", multiline: true }), postalCode: legacy("postalCode"),
      householdRegistration: text("户籍"), studentOrigin: text("生源地"), currentResidence: text("现居住地", { autocomplete: ["street-address"] })
    }, { source: null, sourceFile: "基本信息.json", note: "籍贯、户籍与联系地址" }),
    job: object("求职意向", {
      currentCompany: legacy("currentCompany"), currentPosition: legacy("currentPosition"),
      expectedPosition: legacy("expectedPosition"), expectedCity: legacy("expectedCity"),
      appliedPosition: text("求职岗位", { sourceFile: "基本信息.json" }), targetPositions: list("目标岗位"),
      preferredWorkCities: list("期望工作城市"), expectedSalary: text("期望薪资"), expectedStartDate: text("预计入职时间"),
      campusApplication: object("校园招聘投递", {
        company: text("公司"), recruitmentCohort: text("招聘届次"), positionCategory: text("职位方向"), subCategory: text("子方向"),
        firstChoice: text("志愿一"), preferredCities: list("意向工作城市"), referralCode: text("推荐码"),
        acceptReassignment: text("是否服从调剂"), applicationStatus: text("投递状态"), pendingItems: list("待补充项", { fillable: false })
      }, { source: "2027校园招聘投递" }), dataSources: sources()
    }, { source: null, sourceFile: "求职意向.json", note: "期望岗位、城市、薪资与投递信息" }),
    educationHistory: object("教育经历", {
      records: records("教育经历", {
        educationLevel: text("学历"), degree: text("学位"), studyMode: text("学习形式"), school: text("学校"),
        schoolTags: text("学校标签"), college: text("学院"), major: text("专业"), city: text("城市"), dateRange: text("起止时间"),
        coursework: long("专业课程"), researchFocus: long("研究方向"), thesisTitle: long("毕业论文"), classRank: text("专业排名"),
        overseasEducation: text("是否海外教育经历"), minorOrDualDegree: text("辅修双学位"), supervisor: text("导师", { singleValue: true }),
        gpa: text("成绩GPA"), laboratory: text("实验室"), notes: long("备注", { fillable: false })
      }), dataSources: sources()
    }, { source: null, sourceFile: "教育经历.json", note: "分别维护每一段教育经历" }),
    workExperience: object("工作与实习经历", {
      records: records("工作与实习经历", {
        employmentType: text("类型"), company: text("公司", { autocomplete: ["organization"] }), department: text("部门"),
        position: text("职位", { autocomplete: ["organization-title"] }), dateRange: text("起止时间"), project: text("项目"),
        projectSummary: long("项目简介"), responsibilities: list("工作内容"), departureReason: text("离职原因")
      }), dataSources: sources()
    }, { source: null, sourceFile: "工作与实习经历.json", note: "保留各段工作的单位、职位、内容与离职原因" }),
    family: object("家庭情况", {
      records: records("家庭情况", {
        name: text("姓名", { keywords: ["家庭成员姓名", "亲属姓名", "家属姓名", "family member name"] }),
        relationship: text("关系"), phone: text("电话", { keywords: ["家属电话", "家庭成员电话", "family member phone"] }),
        employer: text("工作单位"), position: text("职位"), politicalStatus: text("政治面貌")
      }), dataSources: sources(), notes: long("备注", { fillable: false })
    }, { source: null, sourceFile: "家庭情况.json", note: "每位家庭成员单独一条记录" }),
    certificates: object("荣誉证书", {
      records: records("荣誉证书", {
        name: text("名称", { keywords: ["证书名称", "certificate name"] }), score: text("成绩"), certificateType: text("类型"),
        proficiency: text("掌握程度"), listeningAndSpeaking: text("听说能力"), readingAndWriting: text("读写能力"),
        obtainedDate: text("获得时间"), certificateNumber: text("证书编号")
      }), dataSources: sources()
    }, { source: null, sourceFile: "荣誉证书.json", note: "证书名称、成绩、能力与编号" }),
    awards: object("获奖情况", {
      records: records("获奖情况", {
        name: text("奖励名称"), awardedDate: text("获奖时间"), awardingOrganization: text("颁奖机构"), level: text("奖励等级"), description: long("奖励描述")
      }), dataSources: sources()
    }, { source: null, sourceFile: "获奖情况.json", note: "奖励、颁奖机构与描述" }),
    publications: object("论文", {
      records: records("论文", {
        title: long("标题", { keywords: ["论文标题", "论文名称", "paper title", "publication title"] }), authorOrder: text("作者顺序"),
        publishedDate: text("发表时间"), journalName: text("刊物名称"), journalTier: text("刊物层级"), url: text("论文链接"),
        publicationChannel: text("发布渠道"), status: long("状态"), relatedResearch: long("关联方向")
      }), dataSources: sources()
    }, { source: null, sourceFile: "论文.json", note: "标题、作者顺序、发表信息与论文状态" }),
    projects: object("项目经历", {
      records: records("项目经历", {
        name: text("项目名称"), projectType: text("类型"), role: text("角色"), dateRange: text("起止时间"),
        summary: long("项目简介"), highlights: list("项目亮点")
      }), dataSources: sources()
    }, { source: null, sourceFile: "项目经历.json", note: "项目、职责与亮点分条维护" }),
    skills: object("专业技能", {
      categories: object("专业技能", {
        programmingLanguages: list("编程语言"), aiSkills: list("大模型 / AI"), frontendSkills: list("前端开发"),
        backendAndDatabaseSkills: list("后端 / 数据库"), otherSkills: list("其他")
      }), proficiency: object("技能掌握程度", { proficient: list("熟练"), good: list("良好") }), dataSources: sources(), notes: long("备注", { fillable: false })
    }, { source: null, sourceFile: "专业技能.json", note: "按类别与掌握程度维护；列表每行一项" }),
    selfAssessment: object("自我评价", {
      summary: long("自我评价", { keywords: ["自我评价", "个人评价", "self assessment", "self evaluation", "personal summary"] }), dataSources: sources()
    }, { source: null, sourceFile: "自我评价.json", note: "完整保留自我评价文本" })
  }, { source: null });
  saf.GROUPS = Object.entries(saf.PROFILE_SCHEMA.properties).map(([key, schema]) => ({ key, label: schema.label, note: schema.note || "" }));
})();
