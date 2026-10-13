(() => {
  "use strict";
  const saf = globalThis.SmartAutofill = globalThis.SmartAutofill || {};
  saf.VERSION = "0.3.3";
  // One match per source: overlapping synonyms never multiply that source's weight.
  saf.FIELD_RULES = [
    { key: "name", group: "basic", label: "姓名", keywords: ["姓名", "真实姓名", "联系人姓名", "fullname", "realname", "username", "name"], autocomplete: ["name"] },
    { key: "phone", group: "basic", label: "手机号", keywords: ["手机号", "手机号码", "手机", "联系电话", "联系方式", "mobile", "mobilephone", "phone", "telephone", "tel"], autocomplete: ["tel", "tel-national"], types: ["tel"] },
    { key: "email", group: "basic", label: "邮箱", keywords: ["邮箱", "电子邮箱", "电子邮件", "邮件地址", "email", "e-mail", "mail"], autocomplete: ["email"], types: ["email"] },
    { key: "gender", group: "basic", label: "性别", keywords: ["性别", "gender", "sex"], autocomplete: ["sex"] },
    { key: "birthday", group: "basic", label: "出生日期", keywords: ["出生日期", "出生年月", "生日", "birthday", "birthdate", "dateofbirth", "dob"], autocomplete: ["bday"] },
    { key: "idCard", group: "basic", label: "身份证号", keywords: ["身份证", "证件号码", "证件号", "idcard", "identitynumber", "identitycard"] },
    { key: "ethnicity", group: "basic", label: "民族", keywords: ["民族", "ethnicity", "ethnic"] },
    { key: "school", group: "education", label: "学校", keywords: ["学校", "院校", "毕业院校", "毕业学校", "就读学校", "大学", "university", "college", "school", "graduateSchool"] },
    { key: "college", group: "education", label: "学院", keywords: ["学院", "院系", "faculty", "department", "collegeName"] },
    { key: "major", group: "education", label: "专业", keywords: ["专业", "所学专业", "专业名称", "major", "specialty"] },
    { key: "educationLevel", group: "education", label: "学历", keywords: ["学历", "最高学历", "educationlevel", "educationbackground", "education"] },
    { key: "degree", group: "education", label: "学位", keywords: ["学位", "最高学位", "degree"] },
    { key: "enrollmentDate", group: "education", label: "入学时间", keywords: ["入学", "入校时间", "enrollmentdate", "admissiondate", "startdate"] },
    { key: "graduationDate", group: "education", label: "毕业时间", keywords: ["毕业时间", "毕业日期", "毕业年月", "graduationdate", "graduatedate", "enddate"] },
    { key: "hometown", group: "location", label: "籍贯", keywords: ["籍贯", "家乡", "hometown", "nativeplace"] },
    { key: "province", group: "location", label: "省份", keywords: ["省份", "所在省", "province", "state"], autocomplete: ["address-level1"] },
    { key: "city", group: "location", label: "现居城市", keywords: ["现居城市", "居住城市", "所在城市", "城市", "currentcity", "city"], autocomplete: ["address-level2"] },
    { key: "address", group: "location", label: "详细地址", keywords: ["详细地址", "联系地址", "通讯地址", "居住地址", "地址", "address", "street"], autocomplete: ["street-address", "address-line1"] },
    { key: "postalCode", group: "location", label: "邮编", keywords: ["邮编", "邮政编码", "postalcode", "postcode", "zipcode", "zip"], autocomplete: ["postal-code"] },
    { key: "currentCompany", group: "job", label: "当前单位", keywords: ["当前单位", "现工作单位", "工作单位", "当前公司", "公司名称", "currentcompany", "company", "employer"], autocomplete: ["organization"] },
    { key: "currentPosition", group: "job", label: "当前岗位", keywords: ["当前岗位", "当前职位", "现任职位", "职务", "currentposition", "jobtitle", "position"], autocomplete: ["organization-title"] },
    { key: "expectedPosition", group: "job", label: "期望岗位", keywords: ["期望岗位", "期望职位", "意向岗位", "应聘岗位", "应聘职位", "expectedposition", "desiredposition", "targetposition"] },
    { key: "expectedCity", group: "job", label: "期望城市", keywords: ["期望城市", "意向城市", "期望工作地", "工作地点", "expectedcity", "desiredcity", "workcity"] }
  ];
  saf.GROUPS = [
    { key: "basic", label: "基本信息", note: "常用的身份与联系方式" },
    { key: "education", label: "教育信息", note: "学校、专业与学习时间" },
    { key: "location", label: "地址信息", note: "籍贯与当前联系地址" },
    { key: "job", label: "求职信息", note: "当前工作与求职意向" }
  ];
})();
