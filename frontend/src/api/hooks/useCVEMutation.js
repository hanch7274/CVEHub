import { useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { QUERY_KEYS } from '../queryKeys';
import { API_BASE_URL } from '../../config';

/**
 * CVE 삭제를 위한 API 함수
 */
const deleteCVE = async (cveId) => {
  const response = await axios.delete(`${API_BASE_URL}/cves/${cveId}`);
  return response.data;
};

/**
 * CVE 삭제를 위한 mutation 훅
 */
const useDeleteCVEMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteCVE,
    onSuccess: (_, cveId) => {
      // 성공 시 관련 쿼리 캐시 무효화
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.CVE_LIST] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.CVE_DETAIL, cveId] });
    },
  });
};

/**
 * CVE 생성을 위한 API 함수
 */
const createCVE = async (cveData) => {
  const response = await axios.post(`${API_BASE_URL}/cves`, cveData);
  return response.data;
};

/**
 * CVE 생성을 위한 mutation 훅
 */
const useCreateCVEMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createCVE,
    onSuccess: () => {
      // 성공 시 목록 쿼리 캐시 무효화
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.CVE_LIST] });
    },
  });
};

/**
 * CVE 업데이트를 위한 API 함수
 */
const updateCVE = async ({ cveId, updateData }) => {
  const response = await axios.put(`${API_BASE_URL}/cves/${cveId}`, updateData);
  return response.data;
};

/**
 * CVE 업데이트를 위한 mutation 훅
 */
const useUpdateCVEMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateCVE,
    onSuccess: (data) => {
      const cveId = data.id;
      // 성공 시 관련 쿼리 캐시 무효화
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.CVE_LIST] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.CVE_DETAIL, cveId] });
    },
  });
};

export { useDeleteCVEMutation, useCreateCVEMutation, useUpdateCVEMutation };