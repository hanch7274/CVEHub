import logging
from datetime import datetime
from typing import Dict, List
from fastapi import APIRouter, Depends, HTTPException, Body
from ..models.cve import CVEModel, Comment
from ..routes.auth import get_current_user
from zoneinfo import ZoneInfo
import traceback

# 로거 설정
logger = logging.getLogger("comment_router")
logger.setLevel(logging.DEBUG)

router = APIRouter()

@router.post("/{cve_id}/comments")
async def add_comment(
    cve_id: str,
    comment_data: Dict[str, str] = Body(...),
    current_user = Depends(get_current_user)
):
    """새로운 댓글을 추가합니다."""
    try:
        logger.info(f"Comment Add - Start for cve_id: {cve_id}")
        logger.debug(f"current_user: {current_user}")
        logger.debug(f"comment_data: {comment_data}")

        content = comment_data.get("content")
        parent_id = comment_data.get("parent_id")
        
        if not content:
            raise HTTPException(status_code=400, detail="댓글 내용을 입력해주세요.")

        cve = await CVEModel.find_one({"cve_id": cve_id})
        if not cve:
            # 대소문자를 구분하지 않는 검색 시도
            cve = await CVEModel.find_one({"$or": [{"cve_id": cve_id}, {"cve_id": cve_id.upper()}]})
            if not cve:
                raise HTTPException(status_code=404, detail="CVE를 찾을 수 없습니다.")

        # 댓글의 깊이(depth) 계산
        depth = 0
        if parent_id:
            parent_comment = None
            for comment in cve.comments:
                if comment.id == parent_id:
                    parent_comment = comment
                    break
        
            if not parent_comment:
                raise HTTPException(status_code=404, detail="부모 댓글을 찾을 수 없습니다.")
            
            depth = parent_comment.depth + 1
            if depth > 5:  # 최대 깊이 제한
                raise HTTPException(status_code=400, detail="더 이상 답글을 작성할 수 없습니다.")

        # 댓글 객체 생성
        comment = Comment(
            username=current_user.username,
            content=content,
            parent_id=parent_id,
            depth=depth,
            created_at=datetime.now(ZoneInfo("Asia/Seoul"))
        )

        # 댓글 목록이 없으면 생성
        if not hasattr(cve, 'comments'):
            cve.comments = []

        # 댓글 추가
        cve.comments.append(comment)

        # 변경사항 저장
        await cve.save()
        logger.info("Comment Add - Success")

        return comment
        
    except Exception as e:
        logger.error(f"Error in add_comment: {str(e)}")
        logger.error(f"Traceback: {traceback.format_exc()}")
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"서버 오류: {str(e)}")

@router.get("/{cve_id}/comments")
async def get_comments(cve_id: str):
    """CVE의 모든 댓글을 조회합니다."""
    try:
        print("\n=== Comment Get Debug ===")
        print(f"CVE ID: {cve_id} (type: {type(cve_id)})")

        # CVE 검색
        print("\n=== Finding CVE ===")
        query = {"cve_id": cve_id}
        print(f"First query: {query}")
        
        cve = await CVEModel.find_one(query)
        print(f"First search result: {cve is not None}")
        
        if not cve:
            # 대소문자를 구분하지 않는 검색 시도
            print(f"Trying case-insensitive search for CVE ID: {cve_id}")
            query = {"$or": [{"cve_id": cve_id}, {"cve_id": cve_id.upper()}]}
            print(f"Second query: {query}")
            
            cve = await CVEModel.find_one(query)
            print(f"Second search result: {cve is not None}")
            
            if not cve:
                # 전체 CVE 목록 확인
                print("\n=== Checking all CVEs ===")
                all_cves = await CVEModel.find({}).to_list()
                print(f"Total CVEs in database: {len(all_cves)}")
                print("Available CVE IDs:")
                for existing_cve in all_cves:
                    print(f"- {existing_cve.cve_id}")
                
                print(f"\nCVE not found with ID: {cve_id}")
                raise HTTPException(status_code=404, detail=f"CVE를 찾을 수 없습니다: {cve_id}")
        
        print(f"Found CVE: {cve.cve_id}")

        
        # 댓글 목록이 없는 경우 빈 리스트 반환
        if not hasattr(cve, 'comments'):
            return []

        # 댓글 목록을 딕셔너리로 변환하고 parent_id가 None인 경우도 명시적으로 포함
        comments = []
        for comment in cve.comments:
            comment_dict = {
                "id": comment.id,
                "content": comment.content,
                "username": comment.username,
                "created_at": comment.created_at,
                "updated_at": comment.updated_at,
                "is_deleted": comment.is_deleted,
                "parent_id": comment.parent_id,  # None이어도 명시적으로 포함
                "depth": comment.depth
            }
            comments.append(comment_dict)
            
        print(f"\nTotal comments found: {len(comments)}")
        return comments
        
    except Exception as e:
        print(f"\n=== Error in get_comments ===")
        print(f"Error type: {type(e)}")
        print(f"Error message: {str(e)}")
        print(f"Traceback: {traceback.format_exc()}")
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"서버 오류: {str(e)}")

@router.patch("/{cve_id}/comments/{comment_id}")
async def update_comment(
    cve_id: str,
    comment_id: str,
    comment_data: Dict[str, str] = Body(...),
    current_user = Depends(get_current_user)
):
    """기존 댓글을 수정합니다."""
    try:
        print("\n=== Request Details ===")
        print(f"CVE ID: {cve_id} (type: {type(cve_id)})")
        print(f"Comment ID: {comment_id} (type: {type(comment_id)})")
        print(f"Comment Data: {comment_data} (type: {type(comment_data)})")
        print(f"Current User: {current_user} (type: {type(current_user)})")
        if hasattr(current_user, '__dict__'):
            print(f"Current User Dict: {current_user.__dict__}")

        content = comment_data.get("content")
        print(f"Content from request: {content} (type: {type(content) if content else 'None'})")
        
        if not content:
            raise HTTPException(status_code=400, detail="댓글 내용을 입력해주세요.")

        # 현재 사용자 정보 가져오기
        if not hasattr(current_user, 'username'):
            print(f"Current user has no username attribute")
            print(f"Current user attributes: {dir(current_user)}")
            raise HTTPException(status_code=401, detail="사용자 정보를 찾을 수 없습니다.")
        
        current_username = current_user.username
        print(f"Current username: {current_username} (type: {type(current_username)})")

        if not current_username:
            raise HTTPException(status_code=401, detail="인증되지 않은 사용자입니다.")

        # CVE 찾기
        print("\n=== Finding CVE ===")
        cve = await CVEModel.find_one({"cve_id": cve_id})
        if not cve:
            print(f"CVE not found with ID: {cve_id}")
            raise HTTPException(status_code=404, detail="CVE를 찾을 수 없습니다.")

        print(f"Found CVE: {cve.cve_id}")
        
        if not hasattr(cve, 'comments') or not cve.comments:
            print("No comments found in CVE")
            raise HTTPException(status_code=404, detail="댓글을 찾을 수 없습니다.")

        # 댓글 찾기 및 권한 확인
        print("\n=== Finding Comment ===")
        print(f"Comments type: {type(cve.comments)}")
        print(f"Total comments: {len(cve.comments)}")
        comment_found = False
        
        for i, comment in enumerate(cve.comments):
            print(f"\nChecking comment {i}:")
            print(f"Comment ID: {comment.id} (type: {type(comment.id)})")
            print(f"Comment type: {type(comment)}")
            print(f"Comment attributes: {dir(comment)}")
            
            if str(comment.id) == comment_id:
                print(f"Found matching comment:")
                print(f"Author: {comment.username}")
                print(f"Content: {comment.content}")
                print(f"Created at: {comment.created_at}")
                print(f"Updated at: {comment.updated_at}")
                
                if comment.username != current_username:
                    print(f"Permission denied. Comment author: {comment.username}, Current user: {current_username}")
                    raise HTTPException(status_code=403, detail="자신의 댓글만 수정할 수 있습니다.")
                
                # 댓글 수정
                print("\n=== Updating Comment ===")
                print(f"Old content: {cve.comments[i].content}")
                print(f"New content: {content}")
                cve.comments[i].content = content
                cve.comments[i].updated_at = datetime.now(ZoneInfo("Asia/Seoul"))
                comment_found = True
                print("Comment updated successfully")
                break

        if not comment_found:
            print(f"Comment not found with ID: {comment_id}")
            raise HTTPException(status_code=404, detail="댓글을 찾을 수 없습니다.")

        # 변경사항 저장
        print("\n=== Saving Changes ===")
        try:
            await cve.save()
            print("Changes saved successfully")
        except Exception as save_error:
            print(f"Error saving changes: {str(save_error)}")
            print(f"Error type: {type(save_error)}")
            print(f"Traceback: {traceback.format_exc()}")
            raise save_error

        return {"message": "댓글이 수정되었습니다."}

    except Exception as e:
        print(f"\n=== Error in update_comment ===")
        print(f"Error type: {type(e)}")
        print(f"Error message: {str(e)}")
        print(f"Traceback: {traceback.format_exc()}")
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"서버 오류: {str(e)}")

@router.delete("/{cve_id}/comments/{comment_id}")
async def delete_comment(
    cve_id: str,
    comment_id: str,
    current_user = Depends(get_current_user)
):
    """댓글을 삭제합니다."""
    try:
        print("\n=== Comment Delete Debug ===")
        print(f"CVE ID: {cve_id} (type: {type(cve_id)})")
        print(f"Comment ID: {comment_id} (type: {type(comment_id)})")
        print(f"Current User: {current_user} (type: {type(current_user)})")

        # 현재 사용자 정보 가져오기
        if not hasattr(current_user, 'username'):
            print(f"Current user has no username attribute: {current_user}")
            raise HTTPException(status_code=401, detail="사용자 정보를 찾을 수 없습니다.")
        
        current_username = current_user.username
        print(f"Current username: {current_username}")

        if not current_username:
            raise HTTPException(status_code=401, detail="인증되지 않은 사용자입니다.")

        # CVE 찾기
        print("\n=== Finding CVE ===")
        cve = await CVEModel.find_one({"cve_id": cve_id})
        if not cve:
            print(f"CVE not found with ID: {cve_id}")
            raise HTTPException(status_code=404, detail="CVE를 찾을 수 없습니다.")

        print(f"Found CVE: {cve.cve_id}")


        if not hasattr(cve, 'comments') or not cve.comments:
            print("No comments found in CVE")
            raise HTTPException(status_code=404, detail="댓글을 찾을 수 없습니다.")

        # 댓글 찾기 및 권한 확인
        print("\n=== Finding Comment ===")
        comment_found = False
        comment_index = -1
        
        for i, comment in enumerate(cve.comments):
            print(f"\nChecking comment {i}:")
            print(f"Comment ID: {comment.id}")
            print(f"Comment author: {comment.username}")
            print(f"Current is_deleted status: {comment.is_deleted}")
            
            if str(comment.id) == comment_id:
                print(f"Found matching comment")
                
                if comment.username != current_username:
                    print(f"Permission denied. Comment author: {comment.username}, Current user: {current_username}")
                    raise HTTPException(status_code=403, detail="자신의 댓글만 삭제할 수 있습니다.")
                
                # 댓글 삭제 (soft delete)
                print("Marking comment as deleted...")
                comment_index = i
                comment_found = True
                print("Comment found and permission verified")
                break

        if not comment_found:
            print(f"Comment not found with ID: {comment_id}")
            raise HTTPException(status_code=404, detail="댓글을 찾을 수 없습니다.")

        # 댓글 삭제 처리
        print("\n=== Deleting Comment ===")
        print(f"Before deletion - is_deleted: {cve.comments[comment_index].is_deleted}")
        cve.comments[comment_index].is_deleted = True
        print(f"After deletion - is_deleted: {cve.comments[comment_index].is_deleted}")

        # 변경사항 저장
        print("\n=== Saving Changes ===")
        try:
            await cve.save()
            print("Changes saved successfully")
            
            # 저장 후 다시 확인
            updated_cve = await CVEModel.find_one({"cve_id": cve_id})
            if updated_cve and updated_cve.comments:
                for comment in updated_cve.comments:
                    if str(comment.id) == comment_id:
                        print(f"Verification after save - is_deleted: {comment.is_deleted}")
                        break
        except Exception as save_error:
            print(f"Error saving changes: {str(save_error)}")
            print(f"Error type: {type(save_error)}")
            print(f"Traceback: {traceback.format_exc()}")
            raise save_error

        return {"message": "댓글이 삭제되었습니다."}

    except Exception as e:
        print(f"\n=== Error in delete_comment ===")
        print(f"Error type: {type(e)}")
        print(f"Error message: {str(e)}")
        print(f"Traceback: {traceback.format_exc()}")
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"서버 오류: {str(e)}")

@router.delete("/{cve_id}/comments/{comment_id}/permanent")
async def permanently_delete_comment(
    cve_id: str,
    comment_id: str,
    current_user = Depends(get_current_user)
):
    """관리자만 사용 가능한 댓글 완전 삭제 엔드포인트"""
    try:
        if current_user.username != "admin":
            raise HTTPException(
                status_code=403,
                detail="관리자만 댓글을 완전히 삭제할 수 있습니다."
            )

        cve = await CVEModel.find_one({"cve_id": cve_id})
        if not cve:
            raise HTTPException(status_code=404, detail="CVE를 찾을 수 없습니다.")

        # 댓글 찾기 및 삭제
        comment_found = False
        cve.comments = [c for c in cve.comments if c.id != comment_id]
        
        # 변경사항 저장
        await cve.save()

        return {"message": "댓글이 완전히 삭제되었습니다."}

    except Exception as e:
        logger.error(f"Error in permanently_delete_comment: {str(e)}")
        logger.error(f"Traceback: {traceback.format_exc()}")
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"서버 오류: {str(e)}")
