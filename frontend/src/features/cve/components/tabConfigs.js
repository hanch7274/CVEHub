// tabConfigs.js
import React from 'react';
import {
  Science as ScienceIcon,
  Shield as ShieldIcon,
  Link as LinkIcon,
  Code as CodeIcon
} from '@mui/icons-material';
import { Chip, Typography, FormControl, InputLabel, Select, MenuItem, TextField } from '@mui/material';
import { ChipLabel } from './CommonStyles';

// PoC 탭 설정
export const POC_SOURCES = {
  Etc: { label: 'Etc', color: 'default' },
  Metasploit: { label: 'Metasploit', color: 'secondary' },
  'Nuclei-Templates': { label: 'Nuclei Templates', color: 'primary' }
};

export const DEFAULT_POC = {
  source: 'Etc',
  url: '',
  description: ''
};

export const pocTabConfig = {
  icon: CodeIcon,
  title: 'Proof of Concept',
  itemName: 'PoC',
  dataField: 'pocs',
  wsFieldName: 'poc',
  defaultItem: DEFAULT_POC,
  emptyTitle: 'No PoCs Available',
  emptyDescription: 'There are no proof of concept codes available for this CVE yet.',
  
  // URL 유효성 검사
  validateItem: (item) => {
    return item.url && item.url.trim() !== '';
  },
  
  // URL 중복 검사
  checkDuplicate: (item, items, excludeIndex = -1) => {
    return items.some((poc, index) => 
      index !== excludeIndex && poc.url.toLowerCase() === item.url.toLowerCase()
    );
  },
  
  // 아이템 라벨 렌더링
  renderItemLabel: (item) => (
    <>
      <Chip
        label={
          <ChipLabel>
            <CodeIcon sx={{ fontSize: 16 }} />
            {POC_SOURCES[item.source]?.label || item.source}
          </ChipLabel>
        }
        size="small"
        color={POC_SOURCES[item.source]?.color || 'default'}
        variant="outlined"
        sx={{ minWidth: 80 }}
      />
      <Typography
        component="a"
        href={item.url.startsWith('http') ? item.url : `https://${item.url}`}
        target="_blank"
        rel="noopener noreferrer"
        sx={{ 
          color: 'primary.main',
          textDecoration: 'none',
          '&:hover': { 
            textDecoration: 'underline',
            cursor: 'pointer'
          },
          fontWeight: 500
        }}
      >
        {item.url}
      </Typography>
    </>
  ),
  
  // 다이얼로그 내용 렌더링
  renderDialogContent: (item, updateItemState, isEdit) => (
    <>
      <FormControl fullWidth sx={{ mt: 2 }}>
        <InputLabel>Source</InputLabel>
        <Select
          value={item.source}
          onChange={(e) => updateItemState(item, 'source', e.target.value)}
          label="Source"
        >
          {Object.entries(POC_SOURCES).map(([value, { label }]) => (
            <MenuItem key={value} value={value}>
              {label}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      <TextField
        required
        fullWidth
        label="URL"
        value={item.url}
        onChange={(e) => updateItemState(item, 'url', e.target.value)}
        error={!item.url}
        helperText={!item.url ? "URL은 필수 입력 항목입니다." : ""}
        sx={{ mt: 2 }}
      />
      <TextField
        fullWidth
        label="Description"
        value={item.description}
        onChange={(e) => updateItemState(item, 'description', e.target.value)}
        multiline
        rows={4}
        sx={{ mt: 2 }}
      />
    </>
  )
};

// Snort Rules 탭 설정
export const RULE_TYPES = {
  USER_DEFINED: { label: '사용자 정의', color: 'default' },
  IPS: { label: 'IPS', color: 'primary' },
  ONE: { label: 'ONE', color: 'secondary' },
  UTM: { label: 'UTM', color: 'success' },
  'Emerging-Threats': { label: 'Emerging Threats', color: 'warning' },
  SNORT_OFFICIAL: { label: 'Snort Official', color: 'info' }
};

export const DEFAULT_RULE = {
  type: 'Emerging-Threats',
  rule: '',
  description: ''
};

export const snortRulesTabConfig = {
  icon: ShieldIcon,
  title: 'Snort Rules',
  itemName: 'Rule',
  dataField: 'snortRules',
  wsFieldName: 'snort_rules',
  defaultItem: DEFAULT_RULE,
  emptyTitle: 'No Snort Rules Available',
  emptyDescription: 'There are no Snort rules defined for this CVE yet.',
  
  // Rule 유효성 검사
  validateItem: (item) => {
    return item.rule && item.rule.trim() !== '';
  },
  
  // 저장 전 아이템 준비
  prepareItemForSave: (item, isUpdate, kstTime) => {
    if (isUpdate) {
      return {
        ...item,
        modifiedAt: kstTime?.toISOString() || new Date().toISOString(),
        modifiedBy: item.currentUser?.username || 'anonymous'
      };
    }
    return {
      ...item,
      createdAt: item.dateAdded,
      createdBy: item.addedBy,
      modifiedAt: null,
      modifiedBy: null
    };
  },
  
  // 아이템 라벨 렌더링
  renderItemLabel: (item) => (
    <Chip
      label={
        <ChipLabel>
          <ShieldIcon sx={{ fontSize: 16 }} />
          {RULE_TYPES[item.type]?.label || item.type}
        </ChipLabel>
      }
      size="small"
      color={RULE_TYPES[item.type]?.color || 'default'}
      variant="outlined"
      sx={{ minWidth: 80 }}
    />
  ),
  
  // 아이템 내용 렌더링 (규칙 코드)
  renderItemContent: (item) => (
    <Typography 
      variant="body2" 
      sx={{ 
        fontSize: '0.813rem',
        maxHeight: '80px',  
        overflow: 'auto'
      }}
    >
      {item.rule}
    </Typography>
  ),
  
  // 다이얼로그 내용 렌더링
  renderDialogContent: (item, updateItemState, isEdit) => (
    <>
      <FormControl fullWidth sx={{ mt: 2 }}>
        <InputLabel>Type</InputLabel>
        <Select
          value={item.type}
          onChange={(e) => updateItemState(item, 'type', e.target.value)}
          label="Type"
        >
          {Object.entries(RULE_TYPES).map(([value, { label }]) => (
            <MenuItem key={value} value={value}>
              {label}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      <TextField
        required
        fullWidth
        label="Rule"
        value={item.rule}
        onChange={(e) => updateItemState(item, 'rule', e.target.value)}
        error={!item.rule}
        helperText={!item.rule ? "Rule은 필수 입력 항목입니다." : ""}
        multiline
        rows={3}
        sx={{ mt: 2 }}
      />
      <TextField
        fullWidth
        label="Description"
        value={item.description}
        onChange={(e) => updateItemState(item, 'description', e.target.value)}
        multiline
        rows={2}
        sx={{ mt: 2 }}
      />
    </>
  )
};

// References 탭 설정
export const REFERENCE_TYPES = {
  NVD: 'NVD',
  EXPLOIT: 'Exploit',
  PATCH: 'Patch',
  OTHER: 'Other'
};

export const DEFAULT_REFERENCE = {
  type: 'OTHER',
  url: '',
  description: '',
  dateAdded: new Date().toISOString(),
  addedBy: 'anonymous'
};

export const referencesTabConfig = {
  icon: LinkIcon,
  title: 'References',
  itemName: 'Reference',
  dataField: 'references',
  wsFieldName: 'references',
  defaultItem: DEFAULT_REFERENCE,
  emptyTitle: 'No References Available',
  emptyDescription: 'There are no references linked to this CVE yet.',
  
  // URL 유효성 검사
  validateItem: (item) => {
    return item.url && item.url.trim() !== '';
  },
  
  // URL 중복 검사
  checkDuplicate: (item, items, excludeIndex = -1) => {
    return items.some((ref, index) => 
      index !== excludeIndex && ref.url.toLowerCase() === item.url.toLowerCase()
    );
  },
  
  // 아이템 라벨 렌더링
  renderItemLabel: (item) => (
    <>
      <Chip
        label={REFERENCE_TYPES[item.type] || item.type}
        size="small"
        color="primary"
        variant="outlined"
      />
      <Typography
        component="a"
        href={item.url.startsWith('http') ? item.url : `https://${item.url}`}
        target="_blank"
        rel="noopener noreferrer"
        sx={{ 
          color: 'primary.main',
          textDecoration: 'none',
          '&:hover': { 
            textDecoration: 'underline',
            cursor: 'pointer'
          },
          fontWeight: 500
        }}
      >
        {item.url}
      </Typography>
    </>
  ),
  
  // 다이얼로그 내용 렌더링
  renderDialogContent: (item, updateItemState, isEdit) => (
    <>
      <FormControl fullWidth sx={{ mt: 2 }}>
        <InputLabel>Type</InputLabel>
        <Select
          value={item.type}
          onChange={(e) => updateItemState(item, 'type', e.target.value)}
          label="Type"
        >
          {Object.entries(REFERENCE_TYPES).map(([value, label]) => (
            <MenuItem key={value} value={value}>
              {label}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      <TextField
        required
        fullWidth
        label="URL"
        value={item.url}
        onChange={(e) => updateItemState(item, 'url', e.target.value)}
        error={!item.url}
        helperText={!item.url ? "URL은 필수 입력 항목입니다." : ""}
        sx={{ mt: 2 }}
      />
      <TextField
        fullWidth
        label="Description"
        value={item.description}
        onChange={(e) => updateItemState(item, 'description', e.target.value)}
        multiline
        rows={3}
        sx={{ mt: 2 }}
      />
    </>
  )
}; 