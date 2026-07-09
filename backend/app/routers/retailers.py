from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import crud, schemas
from ..database import get_db

router = APIRouter(prefix="/api/retailers", tags=["retailers"])


class AssignSalesRepBody(BaseModel):
    sales_rep_id: Optional[int] = None


@router.get("", response_model=List[schemas.Retailer])
def list_retailers(
    search: Optional[str] = None,
    location: Optional[str] = None,
    connection_status: Optional[str] = "all",
    tab: Optional[str] = "zennx",
    db: Session = Depends(get_db),
):
    return crud.get_retailers(db, search, location, connection_status, tab)


@router.get("/{retailer_id}", response_model=schemas.Retailer)
def get_retailer(retailer_id: int, db: Session = Depends(get_db)):
    obj = crud.get_retailer(db, retailer_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Retailer not found")
    return obj


@router.post("", response_model=schemas.Retailer, status_code=201)
def create_retailer(data: schemas.RetailerCreate, db: Session = Depends(get_db)):
    return crud.create_retailer(db, data)


@router.put("/{retailer_id}", response_model=schemas.Retailer)
def update_retailer(
    retailer_id: int, data: schemas.RetailerUpdate, db: Session = Depends(get_db)
):
    obj = crud.update_retailer(db, retailer_id, data)
    if not obj:
        raise HTTPException(status_code=404, detail="Retailer not found")
    return obj


@router.patch("/{retailer_id}/map", response_model=schemas.Retailer)
def map_party(
    retailer_id: int, data: schemas.PartyMapUpdate, db: Session = Depends(get_db)
):
    obj = crud.map_party(db, retailer_id, data)
    if not obj:
        raise HTTPException(status_code=404, detail="Retailer not found")
    return obj


@router.patch("/{retailer_id}/assign-salesrep", response_model=schemas.Retailer)
def assign_salesrep(
    retailer_id: int, body: AssignSalesRepBody, db: Session = Depends(get_db)
):
    obj = crud.assign_sales_rep(db, retailer_id, body.sales_rep_id)
    if not obj:
        raise HTTPException(status_code=404, detail="Retailer not found")
    return obj


@router.delete("/{retailer_id}", status_code=204)
def delete_retailer(retailer_id: int, db: Session = Depends(get_db)):
    if not crud.delete_retailer(db, retailer_id):
        raise HTTPException(status_code=404, detail="Retailer not found")
