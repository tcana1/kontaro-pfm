"""Category, category-group, and categorization-rule access."""
import logging
from typing import Dict, List

import psycopg2.extras

from src.context import get_user_id
from src.database.connection import db_cursor

logger = logging.getLogger(__name__)


def get_categorization_rules() -> Dict[str, int]:
    """Fetches categorization rules from the database."""
    with db_cursor() as cur:
        cur.execute("SELECT payee_keyword, category_id FROM categorization_rules WHERE user_id = %s", (get_user_id(),))
        return {row[0].lower(): row[1] for row in cur.fetchall()}


def get_category_name_by_id(category_id: int) -> str | None:
    """
    Retrieves the category name from the database based on the category ID.
    Returns the category name or None if not found.
    """
    with db_cursor() as cur:
        cur.execute("SELECT name FROM categories WHERE id = %s AND user_id = %s", (category_id, get_user_id()))
        result = cur.fetchone()
        return result[0] if result else None


def get_category_names_by_ids_bulk(category_ids: List[int]) -> Dict[int, str]:
    """
    Retrieves category names for a list of category IDs in bulk.
    Returns a dictionary mapping category IDs to their names.
    """
    if not category_ids:
        return {}

    with db_cursor() as cur:
        cur.execute("SELECT id, name FROM categories WHERE id = ANY(%s) AND user_id = %s", (category_ids, get_user_id()))
        return {cat_id: cat_name for cat_id, cat_name in cur.fetchall()}


def get_category_group_id_by_name(group_name: str) -> int | None:
    """
    Retrieves the category group ID by name. Returns None if not found.
    """
    with db_cursor() as cur:
        cur.execute("SELECT id FROM category_groups WHERE name = %s AND user_id = %s", (group_name, get_user_id()))
        result = cur.fetchone()
        return result[0] if result else None


def get_or_create_category_group(group_name: str) -> int:
    """
    Retrieves the category group ID, creating it if it doesn't exist.
    """
    group_id = get_category_group_id_by_name(group_name)
    if group_id:
        return group_id

    with db_cursor(commit=True) as cur:
        cur.execute(
            "INSERT INTO category_groups (name, user_id) VALUES (%s, %s) RETURNING id",
            (group_name, get_user_id())
        )
        new_group_id = cur.fetchone()[0]
        logger.info(f"Created new category group: {group_name}")
        return new_group_id


def get_or_create_category_groups_bulk(group_names: List[str]) -> Dict[str, int]:
    """
    Retrieves IDs for a list of category group names, creating new groups in bulk if they don't exist.
    Returns a dictionary mapping group names to their IDs.
    """
    group_id_map = {}
    if not group_names:
        return group_id_map

    try:
        with db_cursor(commit=True) as cur:
            # Fetch existing groups
            cur.execute("SELECT id, name FROM category_groups WHERE name = ANY(%s) AND user_id = %s", (list(group_names), get_user_id()))
            for grp_id, grp_name in cur.fetchall():
                group_id_map[grp_name] = grp_id

            # Identify groups that need to be created
            groups_to_create = [(name,) for name in group_names if name not in group_id_map]

            if groups_to_create:
                logger.info(f"Creating {len(groups_to_create)} new category groups in bulk.")
                # Update groups_to_create to include user_id
                groups_to_create_with_user = [(name, get_user_id()) for name, in groups_to_create]
                psycopg2.extras.execute_values(
                    cur,
                    "INSERT INTO category_groups (name, user_id) VALUES %s RETURNING id, name",
                    groups_to_create_with_user
                )
                for grp_id, grp_name in cur.fetchall():
                    group_id_map[grp_name] = grp_id
                logger.info(f"Successfully created {len(groups_to_create)} category groups: {groups_to_create}")
            else:
                logger.info("All category groups already exist.")
    except Exception as e:
        logger.error(f"Error in bulk category group creation: {e}")
        raise
    return group_id_map


def get_category_id_by_name(category_name: str) -> int | None:
    """
    Retrieves the category ID by name. Returns None if not found.
    """
    with db_cursor() as cur:
        cur.execute("SELECT id FROM categories WHERE name = %s AND user_id = %s", (category_name, get_user_id()))
        result = cur.fetchone()
        return result[0] if result else None


def get_or_create_category(category_name: str, group_name: str = None) -> int:
    """
    Retrieves the category ID, creating the category and group if they don't exist.
    """
    category_id = get_category_id_by_name(category_name)
    if category_id:
        return category_id

    # If category doesn't exist, create it
    if not group_name:
        group_name = category_name.split(':')[0].strip() if ':' in category_name else 'Others'

    group_id = get_or_create_category_group(group_name)

    with db_cursor(commit=True) as cur:
        cur.execute(
            "INSERT INTO categories (name, group_id, user_id) VALUES (%s, %s, %s) RETURNING id",
            (category_name, group_id, get_user_id())
        )
        new_category_id = cur.fetchone()[0]
        logger.info(f"Created new category: {category_name} in group: {group_name}")
        return new_category_id


def get_or_create_categories_bulk(category_names: List[str]) -> Dict[str, int]:
    """
    Retrieves IDs for a list of category names, creating new categories in bulk if they don't exist.
    Handles associated category groups.
    Returns a dictionary mapping category names to their IDs.
    """
    category_id_map = {}
    # Filter out None or empty strings from category_names and sort for consistent behavior
    valid_category_names = sorted(list(set([name for name in category_names if name and isinstance(name, str)])))
    if not valid_category_names:
        return category_id_map

    # First, handle category groups
    unique_group_names = list(set([cat_name.split(':')[0].strip() if ':' in cat_name else 'Others' for cat_name in valid_category_names]))
    group_id_map = get_or_create_category_groups_bulk(unique_group_names)

    # Correctly parse full names into (category_name, group_name) tuples
    parsed_names = {}
    for name in valid_category_names:
        if ':' in name:
            group_name, category_name = [n.strip() for n in name.split(':', 1)]
        else:
            group_name, category_name = 'Others', name
        parsed_names[name] = {'cat': category_name, 'grp': group_name}

    try:
        with db_cursor(commit=True) as cur:
            # Fetch all existing categories for the user and create a map for quick lookup
            cur.execute("SELECT c.id, c.name, c.group_id FROM categories c WHERE c.user_id = %s", (get_user_id(),))
            existing_categories = {(row[1], row[2]): row[0] for row in cur.fetchall()}

            # Identify existing categories and categories to be created
            categories_to_create = []
            # This map helps link a (cat_name, group_id) tuple back to its original full name
            creation_map = {}

            for full_name in valid_category_names:
                cat_name = parsed_names[full_name]['cat']
                group_name = parsed_names[full_name]['grp']
                group_id = group_id_map.get(group_name)

                if not group_id:
                    logger.warning(f"Could not find group ID for category '{full_name}' (group: {group_name}). Skipping.")
                    continue

                # Check if the category already exists
                if (cat_name, group_id) in existing_categories:
                    category_id_map[full_name] = existing_categories[(cat_name, group_id)]
                else:
                    # If not, add it to the list of categories to be created
                    # Avoid adding duplicates to the INSERT statement
                    if (cat_name, group_id) not in creation_map:
                        categories_to_create.append((cat_name, group_id, get_user_id()))
                        creation_map[(cat_name, group_id)] = full_name

            if categories_to_create:
                logger.info(f"Creating {len(categories_to_create)} new categories in bulk.")

                psycopg2.extras.execute_values(
                    cur,
                    "INSERT INTO categories (name, group_id, user_id) VALUES %s RETURNING id, name, group_id",
                    categories_to_create
                )

                # Map the new IDs back to the original full category names
                for cat_id, cat_name, group_id in cur.fetchall():
                    full_name = creation_map.get((cat_name, group_id))
                    if full_name:
                        category_id_map[full_name] = cat_id
                    else:
                        # This fallback should ideally not be reached with the current logic
                        logger.warning(f"Could not map created category '{cat_name}' with group ID {group_id} back to a full name.")

                logger.info(f"Successfully created {len(categories_to_create)} categories.")
            else:
                logger.info("All categories already exist.")
    except Exception as e:
        logger.error(f"Error in bulk category creation: {e}")
        raise
    return category_id_map
